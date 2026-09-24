using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

namespace HissAudio {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
  [PreserveSig] int EnumAudioEndpoints(int flow,int state,out ICollection devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 }
 [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ICollection {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int Item(uint index,out IDevice device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
  [PreserveSig] int Activate(ref Guid id,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object result);
 }
 [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessionManager {
  [PreserveSig] int GetAudioSessionControl(ref Guid id,uint flags,out IntPtr result);
  [PreserveSig] int GetSimpleAudioVolume(ref Guid id,uint flags,out IntPtr result);
  [PreserveSig] int GetSessionEnumerator(out ISessions result);
 }
 [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetSession(int index,[MarshalAs(UnmanagedType.IUnknown)] out object result);
 }
 [ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISession {
  [PreserveSig] int GetState(out int state);
  [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name,IntPtr context);
  [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
  [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path,IntPtr context);
  [PreserveSig] int GetGroupingParam(out Guid grouping);
  [PreserveSig] int SetGroupingParam(ref Guid grouping,IntPtr context);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr events);
  [PreserveSig] int UnregisterAudioSessionNotification(IntPtr events);
  [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetProcessId(out uint processId);
 }
 [ComImport,Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMeter {
  [PreserveSig] int GetPeakValue(out float peak);
 }
 sealed class Channel {public uint Pid;public string Name;public IMeter Meter;public object Owner;}
 public static class Service {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static readonly List<Channel> Channels=new List<Channel>();
  static object DesktopOwner;static IMeter Desktop;static string Selection=null;
  static SpectrumReader Spectrum;static string SpectrumError="";static double[] BandEdges={30,180,180,2000,2000,12000};
  static void StopSpectrum(){if(Spectrum!=null)Spectrum.Dispose();Spectrum=null;}
  static void StartSpectrum(){StopSpectrum();SpectrumError="";try{Spectrum=new SpectrumReader(Selection);Spectrum.SetRanges(BandEdges);}catch(Exception ex){StopSpectrum();SpectrumError="频谱未接通："+ex.Message;}}
  static void Drop(object obj){if(obj!=null&&Marshal.IsComObject(obj))try{Marshal.FinalReleaseComObject(obj);}catch{}}
  static void Clear(){foreach(var ch in Channels)Drop(ch.Owner);Channels.Clear();Drop(DesktopOwner);DesktopOwner=null;Desktop=null;}
  static void Send(object value){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
  static object Activate(IDevice device,string id){Guid guid=new Guid(id);object obj;Marshal.ThrowExceptionForHR(device.Activate(ref guid,23,IntPtr.Zero,out obj));return obj;}
  static void Refresh(){
   Clear();IDevices devices=null;ICollection collection=null;IDevice endpoint=null;
   try{
    devices=(IDevices)new DeviceEnumerator();
    if(devices.GetDefaultAudioEndpoint(0,0,out endpoint)>=0){try{DesktopOwner=Activate(endpoint,"C02216F6-8C67-4B5B-9D00-D008E73E0064");Desktop=(IMeter)DesktopOwner;}finally{Drop(endpoint);endpoint=null;}}
    Marshal.ThrowExceptionForHR(devices.EnumAudioEndpoints(0,1,out collection));uint count;collection.GetCount(out count);
    for(uint d=0;d<count;d++){
     IDevice device=null;object managerOwner=null;ISessions sessions=null;
     try{
      collection.Item(d,out device);managerOwner=Activate(device,"77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
      ((ISessionManager)managerOwner).GetSessionEnumerator(out sessions);int total;sessions.GetCount(out total);
      for(int i=0;i<total;i++){
       object owner=null;try{
        sessions.GetSession(i,out owner);ISession session=(ISession)owner;uint pid;int state;
        session.GetProcessId(out pid);session.GetState(out state);if(state==2)continue;
        string name="System sounds";
        if(pid>0){try{using(var process=Process.GetProcessById((int)pid))name=process.ProcessName;}catch{name="Process "+pid;}}
        Channels.Add(new Channel{Pid=pid,Name=name,Meter=(IMeter)owner,Owner=owner});owner=null;
       }catch{}finally{Drop(owner);}
      }
     }catch{}finally{Drop(sessions);Drop(managerOwner);Drop(device);}
    }
    var sources=new List<object>();sources.Add(new {id="desktop",name="桌面音频（默认输出）",available=Desktop!=null});
    var seen=new HashSet<uint>();foreach(var ch in Channels)if(seen.Add(ch.Pid))sources.Add(new{id="pid:"+ch.Pid,name=ch.Pid==0?"系统提示音":ch.Name,available=true});
    Send(new{type="sources",sources=sources});
   }catch(Exception ex){Send(new{type="error",message="Windows 音频设备暂不可用："+ex.Message});}
   finally{Drop(endpoint);Drop(collection);Drop(devices);}
  }
  static float Peak(IMeter meter){float value=0;try{if(meter!=null&&meter.GetPeakValue(out value)>=0&&!float.IsNaN(value))return Math.Max(0,Math.Min(1,value));}catch{}return 0;}
  static void Sample(){
   float peak=0;bool available=false;
   if(Selection=="desktop"){available=Desktop!=null;peak=Peak(Desktop);}
   else if(Selection!=null&&Selection.StartsWith("pid:")){
    uint pid;if(uint.TryParse(Selection.Substring(4),out pid))foreach(var ch in Channels)if(ch.Pid==pid){available=true;peak=Math.Max(peak,Peak(ch.Meter));}
   }
   double[] bands=new double[3];
   if(Spectrum!=null)try{bands=Spectrum.Read();peak=(float)Spectrum.Peak;}catch(Exception ex){SpectrumError="频谱连接中断，请刷新音源："+ex.Message;StopSpectrum();}
   Send(new{type="level",source=Selection,peak=peak,available=available,bands=bands,spectrum=Spectrum!=null,spectrumError=SpectrumError});
  }
  public static void Run(){
   Console.OutputEncoding=new System.Text.UTF8Encoding(false);var commands=new ConcurrentQueue<string>();
   var input=new Thread(()=>{string line;while((line=Console.ReadLine())!=null)commands.Enqueue(line);commands.Enqueue("quit");});input.IsBackground=true;input.Start();
   long refreshAt=0;var clock=Stopwatch.StartNew();bool running=true;Refresh();
   try{while(running){string command;while(commands.TryDequeue(out command)){
    if(command=="quit"){running=false;break;}
    if(command.StartsWith("bands:")){try{var parts=command.Substring(6).Split(',');var edges=new double[parts.Length];for(int i=0;i<parts.Length;i++)edges[i]=double.Parse(parts[i],System.Globalization.CultureInfo.InvariantCulture);new BandAnalyzer(44100,1).SetRanges(edges);BandEdges=edges;if(Spectrum!=null)Spectrum.SetRanges(edges);}catch{Send(new{type="error",message="频段范围无效"});}}
    if(command=="list"){Refresh();refreshAt=clock.ElapsedMilliseconds;}
    if(command=="stop"){StopSpectrum();Selection=null;Send(new{type="level",source="",peak=0,available=false});}
    if(command.StartsWith("watch:")){Selection=command.Substring(6);Refresh();refreshAt=clock.ElapsedMilliseconds;StartSpectrum();}
   }
   if(Selection!=null){if(clock.ElapsedMilliseconds-refreshAt>5000){Refresh();refreshAt=clock.ElapsedMilliseconds;}Sample();}
   Thread.Sleep(33);
   }}finally{StopSpectrum();Clear();}
  }
 }
}
