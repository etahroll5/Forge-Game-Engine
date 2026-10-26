# Forge Desktop (native Windows preview)

This is a **native C# Windows Forms** desktop app, not Electron, a website, or an embedded browser.

Current functionality: open and save Forge JSON projects, display rectangle objects in a scene canvas, select objects, edit position/size/name/color/solid properties, and add rectangles. It is an **early native editor prototype**, not yet feature-equivalent with the browser editor; scripts, physics, event editing and play mode are not yet ported.

Requires .NET 8 SDK on Windows.

Build a self-contained Windows executable from the repository root:

```powershell
dotnet publish desktop/ForgeDesktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o desktop/publish
```

Launch `desktop/publish/ForgeDesktop.exe`. This app does not require Cloudflare or GitHub authentication for local projects. Your browser editor remains available at the repository root `index.html`.
