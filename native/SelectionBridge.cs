// Compiled locally by Windows PowerShell / .NET Framework. No SDK is required.
// All text arrives as JSON over stdin and is treated as data, never as code.
using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Windows.Forms;

namespace LingoLeaf.Native
{
    public static class SelectionBridge
    {
        const int MaxText = 20000;
        const int MaxDocument = 500000;
        const int CaptureLifetimeSeconds = 600;
        static readonly Dictionary<string, Selection> Selections = new Dictionary<string, Selection>();

        sealed class Selection
        {
            public string Id, Text, AppName, Method;
            public IntPtr Window, EditWindow;
            public uint ProcessId;
            public int[] FocusId;
            public AutomationElement Focus, Source;
            public TextPattern Pattern;
            public TextPatternRange Range;
            public int Start, End;
            public bool Editable;
            public DateTime Created;
        }

        sealed class ClipboardSnapshot : IDisposable
        {
            public DataObject Data = new DataObject();
            public uint Sequence;
            public bool Empty;
            readonly List<IDisposable> owned = new List<IDisposable>();
            static readonly HashSet<string> ManagedFormats = new HashSet<string>(StringComparer.Ordinal) {
                DataFormats.Text, DataFormats.UnicodeText, DataFormats.OemText, DataFormats.StringFormat,
                DataFormats.Html, DataFormats.Rtf, DataFormats.CommaSeparatedValue,
                DataFormats.FileDrop, DataFormats.Bitmap, DataFormats.Dib, DataFormats.WaveAudio
            };

            public static ClipboardSnapshot Take()
            {
                ClipboardSnapshot snapshot = new ClipboardSnapshot();
                try {
                    snapshot.Sequence = GetClipboardSequenceNumber();
                    IDataObject source = Clipboard.GetDataObject();
                    if (source == null) { snapshot.Empty = true; return snapshot; }
                    string[] formats = source.GetFormats(false);
                    snapshot.Empty = formats.Length == 0;
                    foreach (string format in formats) {
                        if (!ManagedFormats.Contains(format)) {
                            // GetData on arbitrary application formats can invoke .NET deserialization.
                            // Keep those payloads opaque: copy their native bytes without interpreting them.
                            MemoryStream raw = ReadRawFormat((uint)DataFormats.GetFormat(format).Id);
                            snapshot.owned.Add(raw); snapshot.Data.SetData(format, false, raw);
                            continue;
                        }
                        object value = source.GetData(format, false);
                        object copy;
                        if (value == null) throw new InvalidOperationException("剪贴板有暂时无法读取的格式；为保护原内容，已取消操作。");
                        if (value is string || value is bool || value is char || value is byte || value is short ||
                            value is int || value is long || value is float || value is double || value is decimal ||
                            value is DateTime || value is Guid) copy = value;
                        else if (value is string[]) copy = ((string[])value).Clone();
                        else if (value is byte[]) copy = ((byte[])value).Clone();
                        else if (value is StringCollection) {
                            StringCollection collection = new StringCollection();
                            foreach (string item in (StringCollection)value) collection.Add(item);
                            copy = collection;
                        } else if (value is Image) {
                            Image image = (Image)((Image)value).Clone();
                            snapshot.owned.Add(image); copy = image;
                        } else if (value is Stream) {
                            Stream stream = (Stream)value;
                            if (!stream.CanSeek || stream.Length > 64 * 1024 * 1024) throw new InvalidOperationException("剪贴板内容过大或无法安全备份；已取消操作。");
                            long position = stream.Position;
                            MemoryStream bytes = new MemoryStream();
                            try { stream.Position = 0; stream.CopyTo(bytes); } finally { stream.Position = position; }
                            bytes.Position = 0; snapshot.owned.Add(bytes); copy = bytes;
                        } else {
                            // Never serialize arbitrary clipboard objects. Refuse to overwrite formats we cannot clone.
                            throw new InvalidOperationException("剪贴板包含无法安全备份的应用专用格式；请先复制普通文字后重试。");
                        }
                        snapshot.Data.SetData(format, false, copy);
                    }
                    if (GetClipboardSequenceNumber() != snapshot.Sequence)
                        throw new InvalidOperationException("剪贴板刚刚发生变化，请重试。");
                    return snapshot;
                } catch { snapshot.Dispose(); throw; }
            }

            static MemoryStream ReadRawFormat(uint format)
            {
                if (!OpenClipboard(IntPtr.Zero)) throw new InvalidOperationException("剪贴板正被其他应用占用，请稍后重试。");
                try {
                    IntPtr handle = GetClipboardData(format);
                    ulong size = handle == IntPtr.Zero ? 0 : GlobalSize(handle).ToUInt64();
                    if (size == 0 || size > 64 * 1024 * 1024)
                        throw new InvalidOperationException("剪贴板包含无法安全备份的应用专用格式；请先复制普通文字后重试。");
                    IntPtr bytes = GlobalLock(handle);
                    if (bytes == IntPtr.Zero) throw new InvalidOperationException("无法安全备份剪贴板，已取消操作。");
                    try {
                        byte[] copy = new byte[(int)size]; Marshal.Copy(bytes, copy, 0, copy.Length);
                        return new MemoryStream(copy, false);
                    } finally { GlobalUnlock(handle); }
                } finally { CloseClipboard(); }
            }

            public void Restore(uint ownedSequence)
            {
                // A later copy by the user or another application always wins.
                if (ownedSequence == 0) return;
                for (int attempt = 0; attempt < 3; attempt++) {
                    if (GetClipboardSequenceNumber() != ownedSequence) return;
                    try {
                        if (Empty) Clipboard.SetDataObject(new DataObject(), true, 0, 0);
                        else Clipboard.SetDataObject(Data, true, 0, 0);
                        return;
                    } catch (ExternalException) { Thread.Sleep(25); }
                    catch { return; }
                }
            }

            public void Dispose() { foreach (IDisposable item in owned) item.Dispose(); }
        }

        public static object Capture(long requestedDeadline)
        {
            try { return CaptureCore(requestedDeadline); }
            catch (Exception ex) { throw new InvalidOperationException(Friendly(ex)); }
        }

        static object CaptureCore(long requestedDeadline)
        {
            long deadline = Deadline(requestedDeadline);
            PurgeExpired();
            IntPtr window = GetForegroundWindow();
            if (window == IntPtr.Zero) throw new InvalidOperationException("请先在其他应用中选中一句话。");
            uint pid; GetWindowThreadProcessId(window, out pid);
            if (pid == 0 || pid == (uint)Process.GetCurrentProcess().Id)
                throw new InvalidOperationException("请先在其他应用中选中一句话。");

            AutomationElement focus = ReadSafeFocus(pid);
            Selection selection = new Selection {
                Id = Guid.NewGuid().ToString("N"), Window = window, ProcessId = pid,
                Focus = focus, FocusId = focus.GetRuntimeId(), Created = DateTime.UtcNow,
                AppName = AppName(pid), Method = "uia"
            };
            bool found = TryReadUiaSelection(selection);
            if (!found) found = TryReadNativeEditSelection(selection);
            WaitForReleasedModifiers(deadline);
            EnsureWindow(selection, deadline);
            EnsureSameFocus(selection);
            if (found) ValidateSelection(selection, deadline);
            if (!found) {
                selection.Method = "clipboard";
                selection.Editable = false;
                selection.Text = CopySelection(selection, deadline);
            }
            if (String.IsNullOrWhiteSpace(selection.Text))
                throw new InvalidOperationException("没有读取到选中的文字。请用鼠标选中一句话后重试。");
            if (selection.Text.Length > MaxText)
                throw new InvalidOperationException("一次最多处理 20,000 个字符，请缩小选区。");
            Selections[selection.Id] = selection;
            return new {
                id = selection.Id, text = selection.Text, appName = selection.AppName, processId = selection.ProcessId,
                method = selection.Method, canReplace = selection.Editable,
                capturedAt = selection.Created.ToString("o"),
                replacementHint = selection.Editable ? "" : "当前选区不支持安全替换，可以复制结果后手动粘贴。"
            };
        }

        public static object Replace(string captureId, string text, bool restoreFocus, long requestedDeadline)
        {
            long deadline = Deadline(requestedDeadline);
            Selection selection;
            if (!Selections.TryGetValue(captureId, out selection) || Expired(selection))
                return Result(false, "原选区已过期，请重新选中文字。");
            if (!selection.Editable) return Result(false, "当前选区不支持安全替换，请复制结果后手动粘贴。");
            if (String.IsNullOrEmpty(text) || text.Length > MaxText)
                return Result(false, "替换内容为空或超过 20,000 个字符。");
            if (text.IndexOf('\0') >= 0) return Result(false, "替换内容含有不支持的空字符。");

            uint ownedSequence = 0;
            using (ClipboardSnapshot backup = ClipboardSnapshot.Take()) {
                try {
                    WaitForReleasedModifiers(deadline);
                    if (restoreFocus) {
                        // This flag is accepted only for an explicit user click on Replace in the popup.
                        RestoreFocusForExplicitReplace(selection, deadline);
                    }
                    ValidateSelection(selection, deadline);
                    string beforeDocument = ReadDocument(selection);
                    if (beforeDocument == null) return Result(false, "当前应用无法验证替换结果，请复制译文后手动粘贴。");
                    int start = SelectionOffset(selection);
                    if (start < 0 || start + selection.Text.Length > beforeDocument.Length ||
                        beforeDocument.Substring(start, selection.Text.Length) != selection.Text)
                        return Result(false, "原选区已变化，已取消替换。请重新选中句子。");
                    string expectedDocument = beforeDocument.Substring(0, start) + text + beforeDocument.Substring(start + selection.Text.Length);
                    EnsureDeadline(deadline);
                    // Never overwrite a copy that happened during validation / clipboard backup.
                    if (GetClipboardSequenceNumber() != backup.Sequence)
                        return Result(false, "剪贴板刚刚发生变化，已取消替换。请重试。");
                    Clipboard.SetDataObject(text, true, 0, 0);
                    ownedSequence = GetClipboardSequenceNumber();
                    ValidateSelection(selection, deadline);
                    if (GetClipboardSequenceNumber() != ownedSequence)
                        return Result(false, "剪贴板刚刚发生变化，已取消替换。");
                    EnsureNoModifiers();
                    EnsureDeadline(deadline);
                    SendChord(0x56); // Ctrl+V. The complete input sequence is submitted atomically.
                    Selections.Remove(captureId); // A capture is single-use; a retry must never paste twice.
                    long until = Math.Min(deadline, Now() + 1000);
                    bool verified = false;
                    while (Now() < until) {
                        Thread.Sleep(35);
                        try {
                            if (GetForegroundWindow() != selection.Window) break;
                            string actual = ReadDocument(selection);
                            // RichEdit normalizes line endings on paste.
                            if (actual != null && NormalizeLines(actual) == NormalizeLines(expectedDocument)) { verified = true; break; }
                        } catch { break; }
                    }
                    return Result(verified, verified ? "已替换原选区。" : "已发送粘贴，但未能确认结果。请检查原应用，避免重复替换。");
                } catch (Exception ex) { return Result(false, Friendly(ex)); }
                finally { backup.Restore(ownedSequence); }
            }
        }

        static string CopySelection(Selection selection, long deadline)
        {
            using (ClipboardSnapshot backup = ClipboardSnapshot.Take()) {
                uint ownedSequence = 0;
                try {
                    EnsureWindow(selection, deadline);
                    EnsureSameFocus(selection);
                    EnsureNoModifiers();
                    uint before = GetClipboardSequenceNumber();
                    if (before != backup.Sequence) throw new InvalidOperationException("剪贴板刚刚发生变化，请重试。");
                    EnsureDeadline(deadline);
                    SendChord(0x43); // Ctrl+C, only after positively ruling out password fields.
                    long until = Math.Min(deadline, Now() + 900);
                    while (Now() < until) {
                        Thread.Sleep(20);
                        EnsureWindow(selection, deadline);
                        uint current = GetClipboardSequenceNumber();
                        if (current == before) continue;
                        ownedSequence = current;
                        // Re-check security and focus after copy; never use stale clipboard text.
                        EnsureSameFocus(selection);
                        IntPtr owner = GetClipboardOwner();
                        uint ownerPid = 0;
                        if (owner != IntPtr.Zero) GetWindowThreadProcessId(owner, out ownerPid);
                        if (ownerPid != selection.ProcessId) {
                            ownedSequence = 0; // Another application owns this data: leave it alone.
                            throw new InvalidOperationException("无法确认复制内容来自原应用，已取消读取。");
                        }
                        if (!Clipboard.ContainsText(TextDataFormat.UnicodeText))
                            throw new InvalidOperationException("选区没有可读取的文字。");
                        string text = Clipboard.GetText(TextDataFormat.UnicodeText);
                        if (GetClipboardSequenceNumber() != current) {
                            ownedSequence = 0;
                            throw new InvalidOperationException("剪贴板刚刚发生变化，请重试。");
                        }
                        return text;
                    }
                    throw new InvalidOperationException("当前应用没有响应复制。请确认已选中文字；管理员应用可能需要以相同权限运行 LingoLeaf。");
                } finally { backup.Restore(ownedSequence); }
            }
        }

        static bool TryReadUiaSelection(Selection selection)
        {
            AutomationElement source = selection.Focus;
            for (int depth = 0; source != null && depth < 6; depth++) {
                try {
                    if (source.Current.ProcessId != selection.ProcessId) break;
                    object patternObject;
                    if (source.TryGetCurrentPattern(TextPattern.Pattern, out patternObject)) {
                        TextPattern pattern = (TextPattern)patternObject;
                        TextPatternRange[] ranges = pattern.GetSelection();
                        if (ranges.Length == 1) {
                            string text = ranges[0].GetText(MaxText + 1);
                            if (!String.IsNullOrEmpty(text)) {
                                selection.Pattern = pattern; selection.Source = source;
                                selection.Range = ranges[0].Clone(); selection.Text = text;
                                object readOnly = ranges[0].GetAttributeValue(TextPattern.IsReadOnlyAttribute);
                                selection.Editable = readOnly is bool && !(bool)readOnly;
                                if (!selection.Editable && source.TryGetCurrentPattern(ValuePattern.Pattern, out patternObject))
                                    selection.Editable = !((ValuePattern)patternObject).Current.IsReadOnly;
                                return true;
                            }
                        }
                    }
                    source = TreeWalker.ControlViewWalker.GetParent(source);
                } catch (ElementNotAvailableException) { return false; }
                catch (InvalidOperationException) { return false; }
                catch (COMException) { return false; }
            }
            return false;
        }

        static bool TryReadNativeEditSelection(Selection selection)
        {
            GUITHREADINFO info = new GUITHREADINFO(); info.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
            uint unused; uint thread = GetWindowThreadProcessId(selection.Window, out unused);
            if (!GetGUIThreadInfo(thread, ref info) || info.hwndFocus == IntPtr.Zero) return false;
            StringBuilder name = new StringBuilder(256); GetClassName(info.hwndFocus, name, name.Capacity);
            string className = name.ToString();
            if (!className.Equals("Edit", StringComparison.OrdinalIgnoreCase) && !className.StartsWith("RichEdit", StringComparison.OrdinalIgnoreCase)) return false;
            uint pid; GetWindowThreadProcessId(info.hwndFocus, out pid);
            if (pid != selection.ProcessId) return false;
            long style = GetWindowLongPtr(info.hwndFocus, -16).ToInt64();
            if ((style & 0x20) != 0) throw new InvalidOperationException("密码或受保护输入框不会被读取。");
            int start, end; string document;
            if (!ReadNativeEdit(info.hwndFocus, out start, out end, out document) || start == end) return false;
            if (start < 0 || end < start || end > document.Length) return false;
            selection.EditWindow = info.hwndFocus; selection.Start = start; selection.End = end;
            selection.Text = document.Substring(start, end - start); selection.Editable = (style & 0x800) == 0;
            return true;
        }

        static void ValidateSelection(Selection selection, long deadline)
        {
            EnsureWindow(selection, deadline);
            EnsureSameFocus(selection);
            if (selection.EditWindow != IntPtr.Zero) {
                int start, end; string document;
                if (!ReadNativeEdit(selection.EditWindow, out start, out end, out document) ||
                    start != selection.Start || end != selection.End || end > document.Length ||
                    document.Substring(start, end - start) != selection.Text)
                    throw new InvalidOperationException("原选区已变化，已取消替换。请重新选中句子。");
            } else {
                TextPatternRange[] ranges = selection.Pattern.GetSelection();
                if (ranges.Length != 1 || ranges[0].GetText(MaxText + 1) != selection.Text ||
                    ranges[0].CompareEndpoints(TextPatternRangeEndpoint.Start, selection.Range, TextPatternRangeEndpoint.Start) != 0 ||
                    ranges[0].CompareEndpoints(TextPatternRangeEndpoint.End, selection.Range, TextPatternRangeEndpoint.End) != 0)
                    throw new InvalidOperationException("原选区已变化，已取消替换。请重新选中句子。");
            }
            EnsureDeadline(deadline);
        }

        static string ReadDocument(Selection selection)
        {
            if (selection.EditWindow != IntPtr.Zero) {
                int start, end; string document;
                return ReadNativeEdit(selection.EditWindow, out start, out end, out document) ? document : null;
            }
            string text = selection.Pattern.DocumentRange.GetText(MaxDocument + 1);
            return text.Length <= MaxDocument ? text : null;
        }

        static int SelectionOffset(Selection selection)
        {
            if (selection.EditWindow != IntPtr.Zero) return selection.Start;
            TextPatternRange prefix = selection.Pattern.DocumentRange.Clone();
            prefix.MoveEndpointByRange(TextPatternRangeEndpoint.End, selection.Range, TextPatternRangeEndpoint.Start);
            string value = prefix.GetText(MaxDocument + 1);
            return value.Length <= MaxDocument ? value.Length : -1;
        }

        static bool ReadNativeEdit(IntPtr window, out int start, out int end, out string text)
        {
            start = end = 0; text = null;
            UIntPtr result;
            if (SendMessageTimeout(window, 0x000E, IntPtr.Zero, IntPtr.Zero, 2, 300, out result) == IntPtr.Zero) return false; // WM_GETTEXTLENGTH
            int length = (int)result.ToUInt64();
            if (length < 0 || length > MaxDocument) return false;
            StringBuilder buffer = new StringBuilder(length + 1);
            if (SendMessageTimeoutText(window, 0x000D, new IntPtr(length + 1), buffer, 2, 300, out result) == IntPtr.Zero) return false;
            IntPtr startPointer = Marshal.AllocHGlobal(4), endPointer = Marshal.AllocHGlobal(4);
            try {
                Marshal.WriteInt32(startPointer, 0); Marshal.WriteInt32(endPointer, 0);
                if (SendMessageTimeout(window, 0x00B0, startPointer, endPointer, 2, 300, out result) == IntPtr.Zero) return false; // EM_GETSEL
                start = Marshal.ReadInt32(startPointer); end = Marshal.ReadInt32(endPointer); text = buffer.ToString(); return true;
            } finally { Marshal.FreeHGlobal(startPointer); Marshal.FreeHGlobal(endPointer); }
        }

        static AutomationElement ReadSafeFocus(uint processId)
        {
            AutomationElement focus;
            try { focus = AutomationElement.FocusedElement; } catch { throw new InvalidOperationException("无法确认当前输入框的安全状态，已取消读取。"); }
            if (focus == null || focus.Current.ProcessId != processId)
                throw new InvalidOperationException("无法确认当前应用的输入焦点，请重新选中文字。");
            AutomationElement check = focus;
            for (int depth = 0; check != null && depth < 8; depth++) {
                object password = check.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty, true);
                if (depth == 0 && !(password is bool))
                    throw new InvalidOperationException("当前应用未提供输入框的安全信息，已取消读取。");
                if (password is bool && (bool)password)
                    throw new InvalidOperationException("密码或受保护输入框不会被读取。");
                if (check.Current.ControlType == ControlType.Window) break;
                check = TreeWalker.ControlViewWalker.GetParent(check);
            }
            return focus;
        }

        static void EnsureSameFocus(Selection selection)
        {
            AutomationElement focus = ReadSafeFocus(selection.ProcessId);
            if (!EqualIds(focus.GetRuntimeId(), selection.FocusId))
                throw new InvalidOperationException("输入焦点已变化，已取消操作。请重新选中句子。");
        }

        static void EnsureAlive(Selection selection)
        {
            uint pid; GetWindowThreadProcessId(selection.Window, out pid);
            if (!IsWindow(selection.Window) || pid != selection.ProcessId)
                throw new InvalidOperationException("原应用已关闭，请重新选中文字。");
        }

        static void RestoreFocusForExplicitReplace(Selection selection, long deadline)
        {
            EnsureDeadline(deadline); EnsureAlive(selection);
            IntPtr foreground = GetForegroundWindow();
            if (foreground == selection.Window) return;
            uint unused;
            uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out unused);
            uint targetThread = GetWindowThreadProcessId(selection.Window, out unused);
            uint helperThread = GetCurrentThreadId();
            List<uint> attached = new List<uint>();
            try {
                // AttachThreadInput requires each thread to have a message queue. PeekMessage creates
                // this STA thread's queue without consuming or injecting any input messages.
                IntPtr message = Marshal.AllocHGlobal(64);
                try { PeekMessage(message, IntPtr.Zero, 0, 0, 0); }
                finally { Marshal.FreeHGlobal(message); }
                foreach (uint thread in FocusAttachmentThreads(helperThread, foregroundThread, targetThread)) {
                    EnsureDeadline(deadline);
                    if (!AttachThreadInput(helperThread, thread, true))
                        throw ForegroundRestoreDenied();
                    attached.Add(thread);
                }
                EnsureDeadline(deadline); EnsureAlive(selection);
                IntPtr current = GetForegroundWindow();
                if (current != foreground && current != selection.Window)
                    throw new InvalidOperationException("前台窗口在操作期间发生变化，已取消替换。请重新选中文字。");
                SetForegroundWindow(selection.Window);
                long focusUntil = Math.Min(deadline, Now() + 500);
                while (GetForegroundWindow() != selection.Window && Now() < focusUntil) Thread.Sleep(15);
                if (GetForegroundWindow() != selection.Window) throw ForegroundRestoreDenied();
            } finally {
                // Detach even when activation is denied, the deadline expires, or an application exits.
                for (int i = attached.Count - 1; i >= 0; i--) AttachThreadInput(helperThread, attached[i], false);
            }
            // Input queues are independent again before these checks and before Ctrl+V is submitted.
            // In particular we never SetFocus to a control or recreate a selection that the user changed.
            EnsureWindow(selection, deadline);
            EnsureSameFocus(selection);
        }

        static uint[] FocusAttachmentThreads(uint helper, uint foreground, uint target)
        {
            List<uint> threads = new List<uint>();
            if (foreground != 0 && foreground != helper) threads.Add(foreground);
            if (target != 0 && target != helper && target != foreground) threads.Add(target);
            return threads.ToArray();
        }
        static InvalidOperationException ForegroundRestoreDenied()
        {
            return new InvalidOperationException("Windows 未允许返回原应用，已取消替换。请点击原应用，重新选中文字后重试。");
        }

        static void EnsureWindow(Selection selection, long deadline)
        {
            EnsureDeadline(deadline); EnsureAlive(selection);
            if (GetForegroundWindow() != selection.Window)
                throw new InvalidOperationException("当前窗口已变化，已取消操作。请回到原应用重新选中文字。");
        }

        static void WaitForReleasedModifiers(long deadline)
        {
            long until = Math.Min(deadline, Now() + 1200);
            while (HasModifiers() && Now() < until) Thread.Sleep(15);
            EnsureNoModifiers(); EnsureDeadline(deadline);
        }

        static bool HasModifiers()
        {
            int[] keys = { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0x01, 0x02 };
            foreach (int key in keys) if ((GetAsyncKeyState(key) & 0x8000) != 0) return true;
            return false;
        }
        static void EnsureNoModifiers() { if (HasModifiers()) throw new InvalidOperationException("请先松开快捷键和鼠标按键，再重试。"); }
        static void SendChord(ushort key)
        {
            INPUT[] inputs = { Key(0x11, false), Key(key, false), Key(key, true), Key(0x11, true) };
            if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length)
                throw new InvalidOperationException("Windows 阻止了输入。管理员应用可能需要以相同权限运行 LingoLeaf。");
        }
        static INPUT Key(ushort key, bool up) { INPUT input = new INPUT(); input.type = 1; input.data.keyboard.wVk = key; input.data.keyboard.dwFlags = up ? 2U : 0U; return input; }
        static object Result(bool ok, string message) { return new { ok = ok, message = message }; }
        static string AppName(uint pid) { try { return Process.GetProcessById((int)pid).ProcessName; } catch { return "Windows 应用"; } }
        static bool EqualIds(int[] a, int[] b) { if (a == null || b == null || a.Length != b.Length) return false; for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false; return true; }
        static long Now() { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds; }
        static long Deadline(long requested) { long now = Now(); if (requested <= now) throw new InvalidOperationException("操作已超时，请重新选中文字。"); return Math.Min(requested, now + 8000); }
        static void EnsureDeadline(long deadline) { if (Now() >= deadline) throw new InvalidOperationException("操作已超时，已取消输入。请重试。"); }
        static bool Expired(Selection selection) { return (DateTime.UtcNow - selection.Created).TotalSeconds > CaptureLifetimeSeconds; }
        static void PurgeExpired() {
            List<string> keys = new List<string>();
            foreach (KeyValuePair<string, Selection> pair in Selections) if (Expired(pair.Value)) keys.Add(pair.Key);
            foreach (string key in keys) Selections.Remove(key);
            // Captures only need to outlive one request / popup. Bound sensitive text held in memory.
            while (Selections.Count >= 64) {
                Selection oldest = null;
                foreach (Selection item in Selections.Values) if (oldest == null || item.Created < oldest.Created) oldest = item;
                Selections.Remove(oldest.Id);
            }
        }
        static string NormalizeLines(string text) { return text.Replace("\r\n", "\n").Replace("\r", "\n"); }
        static string Friendly(Exception ex) {
            if (ex is ElementNotAvailableException || ex is COMException) return "原选区已失效，请重新选中文字。";
            if (ex is ExternalException) return "剪贴板正被其他应用占用，请稍后重试。";
            return ex.Message;
        }
        public static void Dispose() { Selections.Clear(); }
        public static object SelfTest()
        {
            bool structSize = Marshal.SizeOf(typeof(INPUT)) == (IntPtr.Size == 8 ? 40 : 28);
            bool equalIds = EqualIds(new int[] { 1, 2 }, new int[] { 1, 2 }) && !EqualIds(new int[] { 1 }, new int[] { 2 });
            bool normalization = NormalizeLines("a\r\nb\r") == "a\nb\n";
            bool expiry = Expired(new Selection { Created = DateTime.UtcNow.AddSeconds(-601) });
            bool timeout = false; try { Deadline(Now() - 1); } catch (InvalidOperationException) { timeout = true; }
            uint[] plan = FocusAttachmentThreads(5, 7, 9), duplicatePlan = FocusAttachmentThreads(5, 7, 7);
            bool attachmentPlan = plan.Length == 2 && plan[0] == 7 && plan[1] == 9 && duplicatePlan.Length == 1 &&
                FocusAttachmentThreads(5, 0, 5).Length == 0;
            if (!(structSize && equalIds && normalization && expiry && timeout && attachmentPlan)) throw new Exception("Native helper self-test failed.");
            return new { ok = true, protocol = 1, inputSize = Marshal.SizeOf(typeof(INPUT)), checks = new string[] { "architecture", "focus-identity", "line-endings", "capture-expiry", "deadline", "focus-attachment-plan" }, interactiveActions = 0 };
        }

        [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion data; }
        [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
        [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public UIntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
        [StructLayout(LayoutKind.Sequential)] struct GUITHREADINFO { public int cbSize; public uint flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll", SetLastError = true)] static extern bool AttachThreadInput(uint thread, uint target, bool attach);
        [DllImport("user32.dll", EntryPoint = "PeekMessageW")] static extern bool PeekMessage(IntPtr message, IntPtr window, uint min, uint max, uint remove);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
        [DllImport("user32.dll")] static extern IntPtr GetClipboardOwner();
        [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
        [DllImport("user32.dll")] static extern bool CloseClipboard();
        [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
        [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr handle);
        [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr handle);
        [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr handle);
        [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref GUITHREADINFO info);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int length);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr64(IntPtr window, int index);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern IntPtr GetWindowLongPtr32(IntPtr window, int index);
        static IntPtr GetWindowLongPtr(IntPtr window, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(window, index) : GetWindowLongPtr32(window, index); }
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
        [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeoutText(IntPtr window, uint message, IntPtr wParam, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
    }
}
