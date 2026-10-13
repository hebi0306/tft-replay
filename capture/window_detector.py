import ctypes
from ctypes import wintypes
from ntpath import basename
from analysis import normalized_roi

user32 = ctypes.WinDLL('user32', use_last_error=True)
kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
user32.GetForegroundWindow.restype = wintypes.HWND
user32.IsWindow.argtypes = [wintypes.HWND]
user32.IsIconic.argtypes = [wintypes.HWND]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
class ProcessEntry(ctypes.Structure):
    _fields_ = [('dwSize', wintypes.DWORD), ('cntUsage', wintypes.DWORD),
                ('th32ProcessID', wintypes.DWORD), ('th32DefaultHeapID', ctypes.c_size_t),
                ('th32ModuleID', wintypes.DWORD), ('cntThreads', wintypes.DWORD),
                ('th32ParentProcessID', wintypes.DWORD), ('pcPriClassBase', wintypes.LONG),
                ('dwFlags', wintypes.DWORD), ('szExeFile', wintypes.WCHAR * 260)]


kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
kernel32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
kernel32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]


def is_game_process(name):
    return basename(name).casefold() in ('league of legends.exe', 'tftclient-win64-shipping.exe')


def game_process_ids():
    # Protected game processes can deny path queries; the process snapshot still exposes names.
    snapshot = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)
    if snapshot == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        entry = ProcessEntry()
        entry.dwSize = ctypes.sizeof(entry)
        found, ids = kernel32.Process32FirstW(snapshot, ctypes.byref(entry)), set()
        while found:
            if is_game_process(entry.szExeFile):
                ids.add(entry.th32ProcessID)
            found = kernel32.Process32NextW(snapshot, ctypes.byref(entry))
        return ids
    finally:
        kernel32.CloseHandle(snapshot)


def game_windows():
    windows = []
    game_pids = game_process_ids()
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    @callback_type
    def visit(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in game_pids:
            title = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, title, 512)
            windows.append({'id': str(hwnd), 'name': title.value.strip() or 'TFT', 'minimized': bool(user32.IsIconic(hwnd))})
        return True

    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user32.EnumWindows(visit, 0)
    return windows


def capture_frame(sct, options):
    import numpy as np
    if options['mode'] == 'window':
        hwnd = int(options['windowId'])
        if not any(w['id'] == str(hwnd) for w in game_windows()):
            raise ValueError('window_missing')
        if user32.IsIconic(hwnd):
            raise ValueError('window_minimized')
        # mss reads displayed pixels, so don't capture other apps covering the game.
        if user32.GetForegroundWindow() != hwnd:
            raise ValueError('window_background')
        rect, origin = wintypes.RECT(), wintypes.POINT(0, 0)
        if not user32.GetClientRect(hwnd, ctypes.byref(rect)) or not user32.ClientToScreen(hwnd, ctypes.byref(origin)):
            raise ValueError('window_missing')
        box = {'left': origin.x, 'top': origin.y, 'width': rect.right, 'height': rect.bottom}
    else:
        index = options['monitor']
        if index < 1 or index >= len(sct.monitors):
            raise ValueError('monitor_missing')
        monitor = sct.monitors[index]
        x, y, w, h = normalized_roi(options['region'])
        box = {'left': monitor['left'] + int(x * monitor['width']), 'top': monitor['top'] + int(y * monitor['height']),
               'width': int(w * monitor['width']), 'height': int(h * monitor['height'])}
    if box['width'] < 100 or box['height'] < 100:
        raise ValueError('invalid_region')
    return np.asarray(sct.grab(box))[:, :, :3].copy()
