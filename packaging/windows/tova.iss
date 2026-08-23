#define AppName "TOVA"
#define AppVersion "0.1.0"
#define AppPublisher "TOVA"
#define AppExeName "tova.exe"

[Setup]
AppId={{8F3C2A91-4D6B-4E18-9C71-TOVA00000001}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\TOVA
DefaultGroupName=TOVA
DisableProgramGroupPage=yes
OutputDir=..\..\dist\windows
OutputBaseFilename=TOVA-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "..\..\dist\windows\tova.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\TOVA"; Filename: "{app}\{#AppExeName}"; Comment: "Opens a command window. Close that window to stop TOVA."
Name: "{group}\Open TOVA in browser"; Filename: "http://127.0.0.1:8000/"
Name: "{autodesktop}\TOVA"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch TOVA"; Flags: nowait postinstall skipifsilent
