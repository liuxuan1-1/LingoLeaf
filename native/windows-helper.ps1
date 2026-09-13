param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing
    $references = @(
        'System.dll', 'System.Core.dll',
        [System.Windows.Automation.AutomationElement].Assembly.Location,
        [System.Windows.Automation.AutomationPattern].Assembly.Location,
        [System.Windows.Automation.Text.TextPatternRange].Assembly.Location,
        [System.Windows.Forms.Clipboard].Assembly.Location,
        [System.Drawing.Image].Assembly.Location
    ) | Select-Object -Unique
    Add-Type -Path (Join-Path $PSScriptRoot 'SelectionBridge.cs') -ReferencedAssemblies $references
    if ($SelfTest) {
        [LingoLeaf.Native.SelectionBridge]::SelfTest() | ConvertTo-Json -Compress -Depth 8
        exit 0
    }
    [Console]::WriteLine('{"event":"ready","protocol":1}')
    while ($null -ne ($line = [Console]::ReadLine())) {
        $requestId = $null
        try {
            if ($line.Length -gt 150000) { throw '请求过长。' }
            $request = $line | ConvertFrom-Json
            $requestId = [string]$request.id
            switch ([string]$request.op) {
                'ping' { $result = @{ protocol = 1; platform = 'win32' } }
                'capture' { $result = [LingoLeaf.Native.SelectionBridge]::Capture([long]$request.deadline) }
                'replace' {
                    $result = [LingoLeaf.Native.SelectionBridge]::Replace(
                        [string]$request.captureId, [string]$request.text,
                        [bool]$request.restoreFocus, [long]$request.deadline)
                }
                default { throw '不支持的选区操作。' }
            }
            @{ id = $requestId; ok = $true; result = $result } | ConvertTo-Json -Compress -Depth 8 | ForEach-Object { [Console]::WriteLine($_) }
        } catch {
            $message = $_.Exception.Message
            if ($_.Exception.InnerException) { $message = $_.Exception.InnerException.Message }
            @{ id = $requestId; ok = $false; error = $message } | ConvertTo-Json -Compress -Depth 8 | ForEach-Object { [Console]::WriteLine($_) }
        }
    }
} catch {
    [Console]::Error.WriteLine('Windows selection helper could not start: ' + $_.Exception.Message)
    exit 1
} finally {
    if ('LingoLeaf.Native.SelectionBridge' -as [type]) { [LingoLeaf.Native.SelectionBridge]::Dispose() }
}
