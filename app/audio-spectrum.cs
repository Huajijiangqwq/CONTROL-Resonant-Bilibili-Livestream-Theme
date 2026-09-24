// WASAPI loopback is analysed in memory. Only three band energies leave this process.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace HissAudio {
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

 public sealed class BandAnalyzer {
  const int N=2048;readonly int Rate;readonly double[][] Ring,Real,Imag;readonly double[] Window=new double[N];int Position,Filled;double[] Edges={30,180,180,2000,2000,12000};
  public void SetRanges(double[] edges){if(edges==null||edges.Length!=6)throw new ArgumentException("Expected six frequency bounds");for(int i=0;i<6;i+=2)if(edges[i]<20||edges[i+1]>20000||edges[i+1]-edges[i]<20)throw new ArgumentException("Invalid frequency bounds");Edges=(double[])edges.Clone();}
  public BandAnalyzer(int rate,int channels){Rate=rate;Ring=new double[channels][];Real=new double[channels][];Imag=new double[channels][];for(int c=0;c<channels;c++){Ring[c]=new double[N];Real[c]=new double[N];Imag[c]=new double[N];}for(int i=0;i<N;i++)Window[i]=.5-.5*Math.Cos(2*Math.PI*i/(N-1));}
  public void Push(double[] frame){for(int c=0;c<Ring.Length;c++){double v=frame[c];Ring[c][Position]=double.IsNaN(v)||double.IsInfinity(v)?0:Math.Max(-1,Math.Min(1,v));}Position=(Position+1)&(N-1);Filled=Math.Min(N,Filled+1);}
  public double[] Measure(){
   var energy=new double[3];if(Filled<N)return energy;
   for(int c=0;c<Ring.Length;c++){
    var re=Real[c];var im=Imag[c];for(int i=0;i<N;i++){re[i]=Ring[c][(Position+i)&(N-1)]*Window[i];im[i]=0;}
    for(int i=1,j=0;i<N;i++){int bit=N>>1;for(;(j&bit)!=0;bit>>=1)j^=bit;j^=bit;if(i<j){double t=re[i];re[i]=re[j];re[j]=t;}}
    for(int len=2;len<=N;len<<=1){double angle=-2*Math.PI/len,wr=Math.Cos(angle),wi=Math.Sin(angle);for(int start=0;start<N;start+=len){double ur=1,ui=0;for(int k=0;k<len/2;k++){int a=start+k,b=a+len/2;double vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;double next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;}}}
    for(int i=1;i<N/2;i++){double hz=(double)i*Rate/N;for(int band=0;band<3;band++)if(hz>=Edges[band*2]&&hz<Edges[band*2+1])energy[band]+=(re[i]*re[i]+im[i]*im[i])*2/(N*N*.375*Ring.Length);}
   }
   for(int b=0;b<3;b++)energy[b]=Math.Min(1,Math.Sqrt(energy[b]));return energy;
  }
 }

 public sealed class SpectrumReader:IDisposable {
  [DllImport("Mmdevapi.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int ActivateAudioInterfaceAsync(string path,ref Guid id,IntPtr parameters,ICompletion completion,out IActivation operation);
  IAudioClient Client;ICapture Capture;AutoResetEvent Event;BandAnalyzer Analyzer;int Channels,Bits,Align,Format;byte[] Bytes=new byte[0];double[] Frame;readonly Stopwatch Clock=Stopwatch.StartNew();long LastPacket;public double Peak{get;private set;}
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
  public SpectrumReader(string source){
   IntPtr format=IntPtr.Zero;IDevices devices=null;IDevice endpoint=null;
   try{
    bool process=source.StartsWith("pid:");
    if(process){Client=(IAudioClient)ProcessClient(uint.Parse(source.Substring(4)));format=Marshal.AllocCoTaskMem(18);byte[] pcm={1,0,2,0,68,172,0,0,16,177,2,0,4,0,16,0,0,0};Marshal.Copy(pcm,0,format,18);}
    else{devices=(IDevices)new DeviceEnumerator();Check(devices.GetDefaultAudioEndpoint(0,0,out endpoint));Guid id=typeof(IAudioClient).GUID;object client;Check(endpoint.Activate(ref id,23,IntPtr.Zero,out client));Client=(IAudioClient)client;Check(Client.GetMixFormat(out format));}
    Format=(ushort)Marshal.ReadInt16(format,0);Channels=(ushort)Marshal.ReadInt16(format,2);int rate=Marshal.ReadInt32(format,4);Align=(ushort)Marshal.ReadInt16(format,12);Bits=(ushort)Marshal.ReadInt16(format,14);
    if(Format==65534)Format=Marshal.ReadInt32(format,24);
    if(!(Format==3&&Bits==32)&&!(Format==1&&(Bits==16||Bits==24||Bits==32)))throw new NotSupportedException("此音频格式暂不支持频谱分析。");
    Analyzer=new BandAnalyzer(rate,Channels);Frame=new double[Channels];
    Check(Client.Initialize(0,0x20000u|(process?0x80040000u:0u),process?0:1000000,0,format,IntPtr.Zero));
    Guid capture=typeof(ICapture).GUID;object captured;Check(Client.GetService(ref capture,out captured));Capture=(ICapture)captured;
    if(process){Event=new AutoResetEvent(false);Check(Client.SetEventHandle(Event.SafeWaitHandle.DangerousGetHandle()));}
    Check(Client.Start());LastPacket=Clock.ElapsedMilliseconds;
   }catch{Dispose();throw;}finally{if(format!=IntPtr.Zero)Marshal.FreeCoTaskMem(format);Drop(endpoint);Drop(devices);}
  }
  public void SetRanges(double[] edges){Analyzer.SetRanges(edges);}
  public double[] Read(){
   uint frames;Check(Capture.GetNextPacketSize(out frames));double peak=0;bool got=false;
   while(frames>0){IntPtr data;uint flags,count;ulong position,counter;Check(Capture.GetBuffer(out data,out count,out flags,out position,out counter));
    try{int length=checked((int)count*Align);bool silent=(flags&2)!=0;if(!silent){if(Bytes.Length<length)Bytes=new byte[length];Marshal.Copy(data,Bytes,0,length);}
     for(int f=0;f<count;f++){for(int c=0;c<Channels;c++){int at=f*Align+c*(Bits/8);double sample=0;if(!silent){if(Format==3)sample=BitConverter.ToSingle(Bytes,at);else if(Bits==16)sample=BitConverter.ToInt16(Bytes,at)/32768.0;else if(Bits==32)sample=BitConverter.ToInt32(Bytes,at)/2147483648.0;else{int value=Bytes[at]|Bytes[at+1]<<8|Bytes[at+2]<<16;sample=((value<<8)>>8)/8388608.0;}}Frame[c]=sample;peak=Math.Max(peak,Math.Abs(sample));}Analyzer.Push(Frame);}
    }finally{Check(Capture.ReleaseBuffer(count));}got=true;LastPacket=Clock.ElapsedMilliseconds;Check(Capture.GetNextPacketSize(out frames));
   }
   if(got)Peak=Math.Min(1,peak);if(Clock.ElapsedMilliseconds-LastPacket>180){Peak=0;return new double[3];}return Analyzer.Measure();
  }
  public void Dispose(){if(Client!=null)try{Client.Stop();}catch{}Drop(Capture);Drop(Client);Capture=null;Client=null;if(Event!=null)Event.Dispose();Event=null;}
 }
}
