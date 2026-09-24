// Local-only PCM pipe. Analysis runs in a dedicated Node worker; no recording or remote transmission.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

using HissAudio;
namespace NowPlayingAudio {
 [ComImport,Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioClient {
  [PreserveSig] int Initialize(int mode,uint flags,long duration,long period,IntPtr format,IntPtr session);
  [PreserveSig] int GetBufferSize(out uint frames);
  [PreserveSig] int GetStreamLatency(out long latency);
  [PreserveSig] int GetCurrentPadding(out uint frames);
  [PreserveSig] int IsFormatSupported(int mode,IntPtr format,out IntPtr closest);
  [PreserveSig] int GetMixFormat(out IntPtr format);
  [PreserveSig] int GetDevicePeriod(out long normal,out long minimum);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr handle);
  [PreserveSig] int GetService(ref Guid id,[MarshalAs(UnmanagedType.IUnknown)] out object service);
 }
 [ComImport,Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ICapture {
  [PreserveSig] int GetBuffer(out IntPtr data,out uint frames,out uint flags,out ulong position,out ulong counter);
  [PreserveSig] int ReleaseBuffer(uint frames);
  [PreserveSig] int GetNextPacketSize(out uint frames);
 }
 [ComImport,Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IActivation {
  [PreserveSig] int GetActivateResult(out int result,[MarshalAs(UnmanagedType.IUnknown)] out object audio);
 }
 [ComVisible(true),Guid("41D949AB-9862-444A-80F6-C261334DA5EB"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface ICompletion {
  [PreserveSig] int ActivateCompleted(IActivation operation);
 }
 [ComVisible(true),Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IAgile {}
 [ComVisible(true),ClassInterface(ClassInterfaceType.None)] public sealed class ActivationCompletion:ICompletion,IAgile {
  public readonly ManualResetEvent Done=new ManualResetEvent(false);public object Audio;public int Result;
  public int ActivateCompleted(IActivation operation){try{int hr=operation.GetActivateResult(out Result,out Audio);if(hr<0)Result=hr;}catch(Exception ex){Result=Marshal.GetHRForException(ex);}finally{Done.Set();}return 0;}
 }

 public sealed class PcmReader:IDisposable {
  [DllImport("Mmdevapi.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int ActivateAudioInterfaceAsync(string path,ref Guid id,IntPtr parameters,ICompletion completion,out IActivation operation);
  IAudioClient Client;ICapture Capture;AutoResetEvent Event;int Channels,Bits,Align,Format,Rate;byte[] Bytes=new byte[0];double[] Frame;readonly Stopwatch Clock=Stopwatch.StartNew();long LastPacket;public double Peak{get;private set;}
  static void Drop(object obj){if(obj!=null&&Marshal.IsComObject(obj))try{Marshal.FinalReleaseComObject(obj);}catch{}}
  static void Check(int hr){Marshal.ThrowExceptionForHR(hr);}
  static object ProcessClient(uint pid){
   if(pid==0)throw new NotSupportedException("系统提示音没有独立频谱，请选择桌面音频。");
   IntPtr payload=Marshal.AllocHGlobal(12),variant=Marshal.AllocHGlobal(IntPtr.Size==8?24:16);IActivation operation=null;var completion=new ActivationCompletion();bool deferred=false;
   Action release=()=>{Drop(operation);completion.Done.Dispose();Marshal.FreeHGlobal(payload);Marshal.FreeHGlobal(variant);};
   try{
    Marshal.WriteInt32(payload,0,1);Marshal.WriteInt32(payload,4,unchecked((int)pid));Marshal.WriteInt32(payload,8,0);
    for(int i=0;i<(IntPtr.Size==8?24:16);i++)Marshal.WriteByte(variant,i,0);Marshal.WriteInt16(variant,0,65);Marshal.WriteInt32(variant,8,12);Marshal.WriteIntPtr(variant,IntPtr.Size==8?16:12,payload);
    Guid id=typeof(IAudioClient).GUID;Check(ActivateAudioInterfaceAsync("VAD\\Process_Loopback",ref id,variant,completion,out operation));
    // The completion owns the native activation lifetime. Never release its
    // payload while Windows can still be using it.
    if(!completion.Done.WaitOne(5000)){deferred=true;ThreadPool.RegisterWaitForSingleObject(completion.Done,(state,timedOut)=>{Drop(completion.Audio);release();},null,-1,true);throw new TimeoutException("应用音频连接超时，请刷新音源重试。");}
    Check(completion.Result);return completion.Audio;
   }finally{if(!deferred)release();}
  }
  public PcmReader(string source){
   IntPtr format=IntPtr.Zero;IDevices devices=null;IDevice endpoint=null;
   try{
    bool process=source.StartsWith("pid:");
    if(process){Client=(IAudioClient)ProcessClient(uint.Parse(source.Substring(4)));format=Marshal.AllocCoTaskMem(18);byte[] pcm={1,0,2,0,68,172,0,0,16,177,2,0,4,0,16,0,0,0};Marshal.Copy(pcm,0,format,18);}
    else{devices=(IDevices)new DeviceEnumerator();Check(devices.GetDefaultAudioEndpoint(0,0,out endpoint));Guid id=typeof(IAudioClient).GUID;object client;Check(endpoint.Activate(ref id,23,IntPtr.Zero,out client));Client=(IAudioClient)client;Check(Client.GetMixFormat(out format));}
    Format=(ushort)Marshal.ReadInt16(format,0);Channels=(ushort)Marshal.ReadInt16(format,2);int rate=Marshal.ReadInt32(format,4);Align=(ushort)Marshal.ReadInt16(format,12);Bits=(ushort)Marshal.ReadInt16(format,14);
    if(Format==65534)Format=Marshal.ReadInt32(format,24);
    if(!(Format==3&&Bits==32)&&!(Format==1&&(Bits==16||Bits==24||Bits==32)))throw new NotSupportedException("此音频格式暂不支持频谱分析。");
    Rate=rate;Frame=new double[Channels];
    Check(Client.Initialize(0,0x20000u|(process?0x80040000u:0u),process?0:1000000,0,format,IntPtr.Zero));
    Guid capture=typeof(ICapture).GUID;object captured;Check(Client.GetService(ref capture,out captured));Capture=(ICapture)captured;
    if(process){Event=new AutoResetEvent(false);Check(Client.SetEventHandle(Event.SafeWaitHandle.DangerousGetHandle()));}
    Check(Client.Start());LastPacket=Clock.ElapsedMilliseconds;
   }catch{Dispose();throw;}finally{if(format!=IntPtr.Zero)Marshal.FreeCoTaskMem(format);Drop(endpoint);Drop(devices);}
  }
  public void Pump(System.IO.BinaryWriter writer){
   uint frames;Check(Capture.GetNextPacketSize(out frames));
   while(frames>0){IntPtr data;uint flags,count;ulong position,counter;Check(Capture.GetBuffer(out data,out count,out flags,out position,out counter));
    try{int length=checked((int)count*Align);bool silent=(flags&2)!=0;
     if(!silent){if(Bytes.Length<length)Bytes=new byte[length];Marshal.Copy(data,Bytes,0,length);}
     writer.Write(0x3153504e);writer.Write(Rate);writer.Write(Channels);writer.Write((int)count);
     for(int f=0;f<count;f++)for(int c=0;c<Channels;c++){
      int at=f*Align+c*(Bits/8);double sample=0;
      if(!silent){if(Format==3)sample=BitConverter.ToSingle(Bytes,at);else if(Bits==16)sample=BitConverter.ToInt16(Bytes,at)/32768.0;else if(Bits==32)sample=BitConverter.ToInt32(Bytes,at)/2147483648.0;else{int v=Bytes[at]|Bytes[at+1]<<8|Bytes[at+2]<<16;sample=((v<<8)>>8)/8388608.0;}}
      writer.Write((float)(double.IsNaN(sample)||double.IsInfinity(sample)?0:Math.Max(-1,Math.Min(1,sample))));
     }
    }finally{Check(Capture.ReleaseBuffer(count));}
    writer.Flush();Check(Capture.GetNextPacketSize(out frames));
   }
  }
  public void Dispose(){if(Client!=null)try{Client.Stop();}catch{}Drop(Capture);Drop(Client);Capture=null;Client=null;if(Event!=null)Event.Dispose();Event=null;}
 }
}

namespace NowPlayingAudio {
 public static class Entry {
  static volatile bool running=true;
  [System.MTAThread] public static void Main(string[] args){
   if(args.Length>0&&args[0]=="list"){HissAudio.Service.Run();return;}
   var input=new System.Threading.Thread(()=>{while(System.Console.ReadLine()!=null){}running=false;});input.IsBackground=true;input.Start();
   try{using(var pcm=new PcmReader(args.Length>0?args[0]:"desktop"))using(var output=new System.IO.BinaryWriter(System.Console.OpenStandardOutput())){
    System.Console.Error.WriteLine("READY");while(running){pcm.Pump(output);System.Threading.Thread.Sleep(4);}
   }}catch(System.Exception ex){System.Console.Error.WriteLine("ERROR: "+ex.Message);System.Environment.ExitCode=1;}
  }
 }
}
