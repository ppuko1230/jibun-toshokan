using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class JibunToshokanLauncher {
    [STAThread]
    private static int Main(string[] args) {
        bool noOpen = Array.IndexOf(args, "--no-open") >= 0;
        try {
            string folder = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(folder, "アプリ本体", "Start-Yohaku.ps1");
            if (!File.Exists(script)) script = Path.Combine(folder, "Start-Yohaku.ps1");
            if (!File.Exists(script)) throw new Exception("ZIPを右クリックして「すべて展開」し、フォルダーの中の自分図書館から開いてください。");
            string options = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"";
            if (noOpen) options += " -NoOpen";
            int portAt = Array.IndexOf(args, "--port");
            if (portAt >= 0) {
                int port;
                if (portAt+1 >= args.Length || !int.TryParse(args[portAt+1],out port) || port<1024 || port>65535) throw new Exception("通信ポートを確認してください。");
                options += " -Port " + port;
            }
            int at = Array.IndexOf(args, "--shortcut-directory");
            if (at >= 0) {
                if (at + 1 >= args.Length || args[at+1].Contains("\"")) throw new Exception("ショートカットの保存先を確認してください。");
                options += " -ShortcutDirectory \"" + args[at+1].TrimEnd('\\') + "\"";
            }
            var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"), options);
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WindowStyle = ProcessWindowStyle.Hidden;
            start.WorkingDirectory = Path.GetDirectoryName(script);
            using (Process process = Process.Start(start)) {
                if (noOpen) { process.WaitForExit(); return process.ExitCode; }
            }
            return 0;
        } catch (Exception e) {
            if (!noOpen) MessageBox.Show(e.Message, "自分図書館", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
    }
}
