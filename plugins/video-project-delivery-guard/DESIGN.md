# Video Project Delivery Guard 设计

## 工程合同

工程根固定为 `artifacts/video/<kebab-case-id>/`，生产引擎为 Remotion。`plan.contract.json` 的 `artifactId` 与 `targetStage` 必须有效；缺失、非法 JSON、未知 stage、非法目录或项目数量超限都 fail closed。

`video.project.json` 固定 composition、帧数、fps、宽高。`package.json` 与 `package-lock.json` 固定 Remotion/React 工具链，并登记 `video:render:visual`、`video:render:audio`、`video:render:final` 三个项目自有脚本。按照仓库信任模型，这些脚本属于项目拥有的受信任可执行配置；插件验证其加载顺序、输出位置和结果，不把执行配置本身当作漏洞。

视觉文件名为 `vNNN-slug.fSSSSSS-fEEEEEE.tsx`，音频 binding 为 `aNNN-role-slug.fSSSSSS-fEEEEEE.audio.json`。区间统一为 `[startFrame,endFrame)`，必须与 manifest 相等且不超过 `durationInFrames`。manifest 必须非空，index 连续，id/source 唯一。

音频素材路径必须规范化后仍位于 `public/` 下且真实存在。视觉 owner 检查覆盖直接源码、相对 import 闭包、Remotion 禁止符号的 alias、renderer、Node I/O、网络、全局 scheduling 与墙钟随机数；项目本地 ESLint rule 提供同一 public seam 的 AST 检查。

## Writer capability

普通文件 Tool 不能写 proof、dist、evidence、review、release、receipt 或 capability 文件。artifact scope 内只允许严格只读 shell 命令，或者形如 `node <精确插件 tools 路径> <精确项目根> ...` 的单一 writer 调用；shell compound、`node -e`、路径子串伪装、未知命令与无法解析的命令均拒绝。

Pre Hook 对精确 writer 调用签发 30 秒有效的 capability：

- capability 绑定 project root、writer role、完整 argv digest 与真实 host session；
- grant 写入被保护且从 subject 中排除的 `.tmp/video-guard/`；
- writer 原子消费一次后立即失效；
- render、probe、review、release 各自只能拥有对应输出角色；
- 直接运行 writer、重放不同 argv、伪造 reviewer session 都不能通过。

## Render、probe、review、release 因果链

`project-render.mjs` 通过无 shell 的 `npm run` 调用受信任项目脚本，将输出写入唯一临时路径，再用 ffprobe 验证：

- visual proof：MP4、精确帧长/fps/宽高、无音轨；
- audio proof：WAV、精确帧长、有效 sample rate/channels、无视频轨；
- final：MP4、精确帧长/fps/宽高、同时存在视频与音频轨。

媒体通过后才原子提升到保护路径，并写 `render-proof/v1`。proof 绑定完整非生成 subject digest、具体 source digest、输出原始字节 digest、实测媒体事实、writer capability 和生成 session。任何源码、素材、配置或工具链变化都会使旧 proof 失效。

`project-probe.mjs` 重新测量最终 MP4，生成 `probe-evidence/v1` 与 `audio-evidence/v1`。`project-review.mjs` 要求不同于 render 的真实 capability session，调用 ffmpeg 抽取至少 start/interior/final 三帧并记录 PNG 字节 hash，同时生成结构化 accessibility 与 review evidence。输入 JSON 的 reviewer session 必须与 capability session 相等，不能靠自报绕过。

`project-release.mjs` 只有在所有 proof/evidence 当前且结构有效时才生成 `release-manifest/v1` 和 receipt v2。manifest 绑定全部交付角色；receipt 同时绑定非生成 subject 与所有生成输出原始字节。

## 原子性与资源边界

各 writer 使用独占 `.video-delivery-journal.json`、唯一临时文件和 rename。只有完整成功后才回收 journal；报错或异常中断都会留下 journal，Stop 会阻断完成态，直到操作者核对并清理半写入结果。

项目 loader 对所有文件使用流式 SHA-256：二进制媒体不解码成 UTF-8，只把有界文本载入合同模型。默认限制为 4096 个文件、单文件 8 GiB、单文本 4 MiB、最多 32 个视频项目；超过限制或读取期间发生变化均 fail closed。SessionStart 只做发现，Post/Failure/Stop 最多运行 120 秒且只哈希和校验，不启动编码器或 reviewer。

## 证明边界

该机制在宿主可观察的 Tool/Hook 边界内建立 render → measure → independent-session review → release 的因果链，不是操作系统沙箱。宿主不可见进程、被攻陷的项目自有 render script、被替换的系统 ffmpeg/ffprobe 或具备直接磁盘权限的操作者仍超出 `snapshot` profile。

媒体测量可以证明 container、stream、尺寸、帧长与输出新鲜度，不能自动证明审美、叙事、字幕语义、内容真实性或人工身份。结构化 review 记录这些结论及 session provenance，但不等同于法律签名或真人身份认证。
