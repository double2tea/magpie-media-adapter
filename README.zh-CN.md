# Magpie Media Adapter

[English](README.md) · [安装说明](INSTALL.md) · [更新记录](CHANGELOG.md)

**版本：0.2.0 · 许可证：Apache-2.0**

独立的 Magpie 网关中间件。继续使用已有模型或模型组，不需要 MCP、额外服务器或供应商密钥。默认不绑定供应商 ID 或组名，常见渠道无需配置。

## 默认行为

- Chat 的内联视频文件转成 `video_url`，在路由筛选前保留视频语义。
- 每个供应商尝试从原请求独立编码音频：Qwen Omni／MiMo 使用 data URI，Gemini 使用 `file`，GPT Audio 使用裸 Base64。匹配依据是实际候选模型名，供应商可自由改名。
- 未知音频模型保留原输入，避免猜测其私有协议。支持的表示可以通过供应商配置覆盖。
- 图片、PDF、普通文字、工具声明、`detail`／`fps` 等已有选项保持原样。
- 不读本地媒体文件、不解析声音、不抓取远程 URL；只转换客户端已经提供的字节表示。
- 不修改模型顺序、思考预算或账户配额。Qwen 音频未指定输出形式时设为文本；调用者明确指定的 `modalities` 保留。

这是格式适配，不是模型能力检测。识别成功也不能保证语义准确。

## 安装

可以直接安装：

```sh
magpie plugin add github:double2tea/magpie-media-adapter
```

也可以把源码放到稳定的本地配置目录，再执行：

```sh
magpie plugin add /absolute/path/to/media-adapter
```

`package.json` 通过 `magpie.middleware` 注册。无需 Node 依赖或构建。关闭插件即可恢复网关原行为。生产请求由 Magpie 内置 JavaScript 引擎执行；Node 仅用于运行测试。

## 无法可靠处理的请求

- **非流式音频**：Qwen Omni、模型组和无法识别真实模型的别名默认明确返回 400，提示 `stream=true`；Gemini、MiMo 等已知可用直连入口允许非流式。其他已验证的别名或组可以覆盖策略。
- **Responses／Anthropic 音频文档**：当前网关无法可靠转换，返回明确错误；这些协议中已受上游支持的视频不主动拦截。原生 Gemini 请求完全不修改。
- 非流式要求检查覆盖保留的历史媒体和工具结果，避免只看最后一条文字而静默丢掉旧音频。
- 已上传的 `file_id` 没有本地字节，原样保留。
- 未知自定义模型别名无法从名字推断真实供应商协议，需一条覆盖规则；插件不绕过账户鉴权或能力过滤。
- Gemini／MiMo 在组内因能力目录缺失而被排除的问题仍由上游处理：<https://github.com/yetone/magpie/issues/6210>。

## 可选配置

一般不需要配置。特殊环境可在 `~/.config/magpie/plugins.json` 对应条目的 `options` 中设置：

```json
{
  "spec": "/absolute/path/to/media-adapter",
  "options": {
    "models": ["group/my-media", "my-relay/omni"],
    "nonStreamingAudio": "auto",
    "providers": {
      "my-relay": { "audio": "data-uri", "video": "video_url" },
      "my-native-gemini": { "audio": "file" }
    }
  }
}
```

- `models`：省略表示不按模型名限制；数组精确匹配请求模型，`["*"]` 表示全部，`[]` 禁用该插件的请求处理。两阶段统一使用此范围。
- `nonStreamingAudio`：`auto` 为上述默认策略，`reject` 拒绝所有非流式音频，`pass` 允许经过已自行验证的路由。改为 `pass` 不能修复上游媒体丢失。
- `providers`：键为实际供应商 ID。`audio` 支持 `data-uri`、`base64`、`file`、`preserve`；`video` 支持 `video_url`、`file`、`preserve`；`streamingRequired`、`textOnly`、`disabled` 为布尔值。`disabled` 只跳过该候选的编码，不能撤销请求入口已经执行的格式规范化。

远程 HTTP(S) 视频保持为 URL，转换到文件时使用 `file_url`。远程音频仅允许已明确采用文件 URL 的直连目标（例如 Gemini Native 或配置 `audio: "file"` 的直连供应商）；模型组及其他目标要求调用者先提供内联 Base64 音频。同步中间件不能联网下载，也不能在选模后拒绝一个不兼容候选，因此保留这条明确边界。

视频 MIME 在 `file → video_url → file` 的转换中保留，例如 WebM 不会因为下载地址没有扩展名而被改成 MP4。已有 `video_url` 的 `fps`／`detail` 在保持该格式时不变；如果配置了无法表达这些选项的 `video: "file"`，请求会明确拒绝，避免丢弃采样约束。

## 维护与验证

```sh
npm test
```

测试使用真实的非抛异常 `ctx.reject` 语义，覆盖重命名供应商、任意组名、后备候选重编码、直连、历史音频、音视频 MIME/格式冲突、远程 URL、未知模型、选择范围、工具结果和思考设置保持。

Magpie 的每个 middleware hook 有 250 ms 时限，超时和未处理异常会 **fail-open**。插件在 `onRequest` 中把已知配置／媒体表示错误转为明确拒绝；不能承诺超大附件永不超时。每次 hook 都会遍历消息，长历史和大文件的处理成本必须通过实际网关计数检查。

`onProvider` 不能拒绝单次候选，所以不在该阶段伪造拒绝；请求级验证在路由前完成。插件不解码整个媒体，也不重写模型回答。跨全部供应商的自动后备兼容仍依赖各模型的实际协议及 Magpie 目录。

当前版本为 v0.2.0。33 项回归测试不使用真实密钥；两台实际网关也完成了媒体链路检查，但模型的转写与信息提取仍可能出错。详细英文兼容范围、更新和移除方式见 [README](README.md) 与 [INSTALL](INSTALL.md)。
