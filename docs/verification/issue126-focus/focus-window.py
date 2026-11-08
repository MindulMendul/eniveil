import ctypes,sys
x=ctypes.CDLL('libX11.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;x.XOpenDisplay.argtypes=[ctypes.c_char_p]
x.XSetInputFocus.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong];x.XRaiseWindow.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
d=x.XOpenDisplay(None)
if not d:raise SystemExit('No test display')
w=int(sys.argv[1],16);x.XRaiseWindow(d,w);x.XSetInputFocus(d,w,2,0);x.XSync(d,0);x.XCloseDisplay(d)
