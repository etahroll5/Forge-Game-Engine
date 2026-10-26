using System.Drawing;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Forms;

ApplicationConfiguration.Initialize();
Application.Run(new ForgeWindow());

sealed class ForgeWindow : Form
{
    JsonObject project = new();
    JsonArray objects = new();
    string? currentPath;
    readonly ListBox objectList = new() { Dock = DockStyle.Fill };
    readonly PropertyGrid inspector = new() { Dock = DockStyle.Fill };
    readonly SceneView scene = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(23, 31, 45) };
    readonly ToolStripStatusLabel status = new("Ready");
    readonly TextBox projectName = new() { Width = 240 };
    public ForgeWindow()
    {
        Text = "Forge Game Engine — Desktop (Preview)";
        Width = 1250; Height = 800; MinimumSize = new Size(800, 500);
        var menu = new MenuStrip();
        var file = new ToolStripMenuItem("File");
        file.DropDownItems.Add("New", null, (_, _) => NewProject());
        file.DropDownItems.Add("Open Forge JSON...", null, (_, _) => OpenProject());
        file.DropDownItems.Add("Save", null, (_, _) => SaveProject(false));
        file.DropDownItems.Add("Save As...", null, (_, _) => SaveProject(true));
        menu.Items.Add(file);
        var add = new ToolStripMenuItem("Add");
        add.DropDownItems.Add("Rectangle", null, (_, _) => AddObject());
        menu.Items.Add(add);
        MainMenuStrip = menu; Controls.Add(menu);
        var statusBar = new StatusStrip(); statusBar.Items.Add(status); Controls.Add(statusBar);
        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 230 };
        var right = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 700, FixedPanel = FixedPanel.Panel2 };
        var leftPanel = new Panel { Dock = DockStyle.Fill };
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 72, FlowDirection = FlowDirection.TopDown };
        top.Controls.Add(new Label { Text = "Project name", AutoSize = true });
        top.Controls.Add(projectName);
        leftPanel.Controls.Add(objectList); leftPanel.Controls.Add(top);
        split.Panel1.Controls.Add(leftPanel);
        right.Panel1.Controls.Add(scene);
        right.Panel2.Controls.Add(inspector);
        split.Panel2.Controls.Add(right);
        Controls.Add(split); split.BringToFront();
        objectList.SelectedIndexChanged += (_, _) => SelectObject();
        scene.ObjectSelected += index => objectList.SelectedIndex = index;
        NewProject();
    }
    void NewProject()
    {
        currentPath = null;
        project = new JsonObject { ["version"] = 3, ["name"] = "My Forge Game", ["width"] = 960, ["height"] = 540, ["background"] = "#e7edf6", ["objs"] = new JsonArray(), ["actions"] = new JsonArray(), ["script"] = "" };
        objects = (JsonArray)project["objs"]!;
        AddObject();
        RefreshProject();
        status.Text = "New project";
    }
    void AddObject()
    {
        var o = new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["name"] = "Rectangle " + (objects.Count + 1), ["type"] = "rect", ["x"] = 80 + objects.Count * 35, ["y"] = 80 + objects.Count * 35, ["w"] = 100, ["h"] = 75, ["color"] = "#79e2d0", ["solid"] = false };
        objects.Add(o); RefreshProject(); objectList.SelectedIndex = objects.Count - 1;
    }
    void RefreshProject()
    {
        projectName.Text = project["name"]?.ToString() ?? "My Forge Game";
        objectList.Items.Clear();
        foreach (var o in objects) objectList.Items.Add(o?["name"]?.ToString() ?? "Object");
        scene.Project = project; scene.Invalidate();
    }
    void SelectObject()
    {
        var i = objectList.SelectedIndex;
        inspector.SelectedObject = i >= 0 && i < objects.Count && objects[i] is JsonObject obj ? new ObjectProperties(obj, () => { RefreshNames(); scene.Invalidate(); }) : null;
        scene.SelectedIndex = i; scene.Invalidate();
    }
    void RefreshNames()
    {
        var i = objectList.SelectedIndex;
        for (int j = 0; j < objects.Count; j++) objectList.Items[j] = objects[j]?["name"]?.ToString() ?? "Object";
        if (i >= 0 && i < objectList.Items.Count) objectList.SelectedIndex = i;
    }
    void OpenProject()
    {
        using var dialog = new OpenFileDialog { Filter = "Forge project (*.json)|*.json|All files (*.*)|*.*" };
        if (dialog.ShowDialog() != DialogResult.OK) return;
        try
        {
            var loaded = JsonNode.Parse(File.ReadAllText(dialog.FileName)) as JsonObject ?? throw new Exception("Not a JSON object");
            if (loaded["objs"] is not JsonArray arr) throw new Exception("Missing objs array");
            project = loaded; objects = arr; currentPath = dialog.FileName;
            RefreshProject(); status.Text = "Opened " + Path.GetFileName(currentPath);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Unable to open project"); }
    }
    void SaveProject(bool saveAs)
    {
        if (saveAs || currentPath is null)
        {
            using var dialog = new SaveFileDialog { Filter = "Forge project (*.json)|*.json", FileName = projectName.Text + ".json" };
            if (dialog.ShowDialog() != DialogResult.OK) return;
            currentPath = dialog.FileName;
        }
        try
        {
            project["name"] = projectName.Text;
            File.WriteAllText(currentPath!, project.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            status.Text = "Saved " + Path.GetFileName(currentPath);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Unable to save project"); }
    }
}

sealed class ObjectProperties
{
    readonly JsonObject obj;
    readonly Action changed;
    public ObjectProperties(JsonObject obj, Action changed) { this.obj = obj; this.changed = changed; }
    string Get(string k, string fallback = "") => obj[k]?.ToString() ?? fallback;
    void Set(string k, JsonNode? v) { obj[k] = v; changed(); }
    public string Name { get => Get("name"); set => Set("name", JsonValue.Create(value)); }
    public int X { get => int.TryParse(Get("x"), out var v) ? v : 0; set => Set("x", JsonValue.Create(value)); }
    public int Y { get => int.TryParse(Get("y"), out var v) ? v : 0; set => Set("y", JsonValue.Create(value)); }
    public int Width { get => int.TryParse(Get("w"), out var v) ? v : 100; set => Set("w", JsonValue.Create(value)); }
    public int Height { get => int.TryParse(Get("h"), out var v) ? v : 100; set => Set("h", JsonValue.Create(value)); }
    public string ColorHex { get => Get("color", "#79e2d0"); set => Set("color", JsonValue.Create(value)); }
    public bool Solid { get => bool.TryParse(Get("solid"), out var v) && v; set => Set("solid", JsonValue.Create(value)); }
}

sealed class SceneView : Control
{
    public JsonObject? Project { get; set; }
    public int SelectedIndex { get; set; } = -1;
    public event Action<int>? ObjectSelected;
    public SceneView() { DoubleBuffered = true; }
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (Project is null) return;
        var g = e.Graphics; g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        float w = float.TryParse(Project["width"]?.ToString(), out var pw) ? pw : 960;
        float h = float.TryParse(Project["height"]?.ToString(), out var ph) ? ph : 540;
        float scale = Math.Min((Width - 30) / w, (Height - 30) / h);
        if (scale <= 0) return;
        g.TranslateTransform(15, 15); g.ScaleTransform(scale, scale);
        using var bg = new SolidBrush(ParseColor(Project["background"]?.ToString(), Color.White));
        g.FillRectangle(bg, 0, 0, w, h);
        if (Project["objs"] is not JsonArray objs) return;
        for (int i = 0; i < objs.Count; i++)
        {
            var o = objs[i]; if (o is null) continue;
            float x = N(o, "x"), y = N(o, "y"), ow = N(o, "w", 80), oh = N(o, "h", 60);
            using var brush = new SolidBrush(ParseColor(o["color"]?.ToString(), Color.MediumAquamarine));
            g.FillRectangle(brush, x, y, ow, oh);
            if (i == SelectedIndex) { using var pen = new Pen(Color.DeepSkyBlue, 3); g.DrawRectangle(pen, x, y, ow, oh); }
        }
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (Project?["objs"] is not JsonArray objs) return;
        float w = N(Project, "width", 960), h = N(Project, "height", 540);
        float scale = Math.Min((Width - 30) / w, (Height - 30) / h);
        if (scale <= 0) return;
        float x = (e.X - 15) / scale, y = (e.Y - 15) / scale;
        for (int i = objs.Count - 1; i >= 0; i--)
        {
            var o = objs[i]; if (o is null) continue;
            if (x >= N(o, "x") && y >= N(o, "y") && x <= N(o, "x") + N(o, "w", 80) && y <= N(o, "y") + N(o, "h", 60)) { ObjectSelected?.Invoke(i); return; }
        }
    }
    static float N(JsonNode? o, string key, float fallback = 0) => float.TryParse(o?[key]?.ToString(), out var n) ? n : fallback;
    static Color ParseColor(string? text, Color fallback) { try { return ColorTranslator.FromHtml(text ?? ""); } catch { return fallback; } }
}
