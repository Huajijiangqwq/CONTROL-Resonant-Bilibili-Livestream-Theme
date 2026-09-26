param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference='Stop'
# Patch resources in the newly staged executable, never in a running installation.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class ControlIconResources {
  delegate bool Names(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
  delegate bool Languages(IntPtr module, IntPtr type, IntPtr name, ushort lang, IntPtr param);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool FreeLibrary(IntPtr module);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool EnumResourceNames(IntPtr module,IntPtr type,Names callback,IntPtr param);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool EnumResourceLanguages(IntPtr module,IntPtr type,IntPtr name,Languages callback,IntPtr param);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResource(string path,bool remove);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool UpdateResource(IntPtr update,IntPtr type,IntPtr name,ushort lang,byte[] data,uint length);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool EndUpdateResource(IntPtr update,bool discard);
  public static void Apply(string exe,string ico) {
    byte[] data=File.ReadAllBytes(ico); ushort count=BitConverter.ToUInt16(data,4);
    if(data.Length<6 || count==0 || BitConverter.ToUInt16(data,2)!=1) throw new Exception("Invalid icon");
    var groups=new List<Tuple<int,ushort>>();
    IntPtr module=LoadLibraryEx(exe,IntPtr.Zero,2);
    if(module==IntPtr.Zero) throw new Win32Exception();
    try { EnumResourceNames(module,(IntPtr)14,(m,t,n,p)=>{if(n.ToInt64()<=65535)EnumResourceLanguages(m,t,n,(a,b,c,lang,d)=>{groups.Add(Tuple.Create(c.ToInt32(),lang));return true;},IntPtr.Zero);return true;},IntPtr.Zero); }
    finally { FreeLibrary(module); }
    if(groups.Count==0) groups.Add(Tuple.Create(1,(ushort)0));
    IntPtr handle=BeginUpdateResource(exe,false); if(handle==IntPtr.Zero)throw new Win32Exception();
    bool success=false;
    try {
      byte[] group=new byte[6+count*14];Array.Copy(data,0,group,0,6);
      for(int i=0;i<count;i++) {
        int at=6+i*16;uint size=BitConverter.ToUInt32(data,at+8),offset=BitConverter.ToUInt32(data,at+12);
        byte[] image=new byte[size];Array.Copy(data,offset,image,0,size);
        int id=500+i;
        if(!UpdateResource(handle,(IntPtr)3,(IntPtr)id,0,image,size))throw new Win32Exception();
        Array.Copy(data,at,group,6+i*14,12);Array.Copy(BitConverter.GetBytes((ushort)id),0,group,6+i*14+12,2);
      }
      foreach(var entry in groups)if(!UpdateResource(handle,(IntPtr)14,(IntPtr)entry.Item1,entry.Item2,group,(uint)group.Length))throw new Win32Exception();
      success=true;
    } finally { if(!EndUpdateResource(handle,!success) && success)throw new Win32Exception(); }
  }
}
'@
[ControlIconResources]::Apply([IO.Path]::GetFullPath($Executable),[IO.Path]::GetFullPath($Icon))
