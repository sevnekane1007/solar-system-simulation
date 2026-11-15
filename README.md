# Solar System Simulation · 太阳系小行星轨道动态图

一个纯网页的太阳系小行星轨道动态模拟：在浏览器里观察数万颗小行星围绕太阳运行，支持时间加速、分类筛选和轨迹线。无需安装依赖，不需要构建。

A dependency-free, browser-based simulation of minor-body orbits in the solar system, driven by orbital elements.

## 功能

- 最多 30,000 颗小行星同时运行，数量可调（1,000–30,000）
- 时间加速（1x–5000x），显示模拟日期
- 分类筛选：主带、近地（NEO）、潜在威胁（PHA）、特洛伊
- 八大行星、小行星轨迹线、可开关的辉光效果
- 鼠标拖动旋转视角，滚轮缩放

## 运行

项目是纯静态网页，用任意静态服务器打开 `index.html` 即可。例如已安装 Python 时：

```bash
python -m http.server 4173
```

然后访问 <http://127.0.0.1:4173>。
![Uploading image.png…]()

## 数据来源

启动时程序会尝试从 NASA/JPL 的 [Small-Body Database (SBDB) Query API](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) 读取小行星轨道根数。若网络不可用，则使用程序内置生成的示例轨道数据，动画仍可正常运行。

Orbital data courtesy of NASA/JPL Small-Body Database.

## 技术说明

- 原生 HTML + CSS + JavaScript，使用 Canvas 2D 绘制
- 由轨道根数（a、e、i、Ω、ω、M）计算位置，不依赖第三方库

## 许可证

[MIT](./LICENSE) © 2026 Seven
