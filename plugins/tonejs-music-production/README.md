# Tone.js 音乐制作插件

`tonejs-music-production` 是一个同时支持 Codex 和 Claude 的程序化音乐插件。它用可审查的 JavaScript 模块管理旋律、和声、节奏、曲式与乐器，通过有限且确定的数学搜索生成候选乐谱，再由浏览器中的 `Tone.Offline` 离线渲染。只有源码绑定、客观音频分析和当次人工听审同时有效时，插件才允许发布 48 kHz 双声道 PCM16 WAV。

数学模型用于提高时间精度、结构一致性和结果可复现性，不代表作品一定符合所有人的审美。最终音乐效果仍需通过实际听审判断。

## 工作链路

```text
composition.mjs -> 数学优化 -> 乐谱 + 指标 -> Tone.Offline -> 分轨 + 混音
                                                        -> 音频分析 + 人工听审
                                                        -> WAV + 证据 + 发布凭证
```

完整制作流程由插件内置的 `$tonejs-music-production` Skill 管理。音乐项目创建在 `artifacts/music/<id>`，每个项目独立安装并锁定 Tone.js、Tonal、Playwright、esbuild 和 ESLint 版本。

## 快速开始

以下命令需要在插件仓库根目录运行：

```bash
export PLUGIN_ROOT="$PWD/plugins/tonejs-music-production"

node "$PLUGIN_ROOT/scripts/tools/project-init.mjs" demo-track \
  --workspace "$PWD" \
  --install-browser

node "$PLUGIN_ROOT/scripts/tools/project-lint.mjs" \
  "artifacts/music/demo-track"

node "$PLUGIN_ROOT/scripts/tools/project-optimize.mjs" \
  "artifacts/music/demo-track"

node "$PLUGIN_ROOT/scripts/tools/project-render.mjs" \
  "artifacts/music/demo-track"

node "$PLUGIN_ROOT/scripts/tools/project-preview.mjs" \
  "artifacts/music/demo-track"
```

初始化后，主要编辑这些源码文件：

- `src/composition.mjs`：曲式、动机、和声、能量曲线和轨道分配。
- `src/instruments/*.mjs`：Tone.js 合成器、效果器和输出连接。
- `music.project.json`：轨道注册、音频格式和数值质量阈值。
- `plan.contract.json`：当前目标阶段，取值为 `source` 或 `release`。

优化阶段会生成 `build/score.<sourceDigest>.json` 和 `build/metrics.<sourceDigest>.json`。渲染阶段会生成分轨 WAV、混音 WAV 和 `build/render.<sourceDigest>.json` 渲染凭证。

## 数学模型

音乐时间采用 960 PPQ 的整数 tick 表示，音高由调式音级确定性地映射为 MIDI 整数。优化器按以下顺序工作：

1. 硬约束先拒绝非法时间范围、非有限数值、越界音高、静音结果、轨道归属冲突和错误的段落拓扑。
2. 对动机执行有限的旋转、逆行等确定性变换，并按实际音乐内容去重。
3. 使用配置文件中的归一化权重，评价和声连贯性、声部进行、节奏契合度、动机一致性、结构弧线、音区分离和受控新颖度。
4. 总分相同时使用稳定的内容摘要排序，确保相同源码始终得到相同结果。

插件提供三套有界评分配置。欧几里得节奏只用于适合均匀脉冲分布的音乐角色，不为了形式复杂而引入额外数学结构。

## 设计约束

插件的目标是建立一条可以验证的因果链：音乐源码决定符号乐谱，数学优化器决定候选排序，Tone.js 负责合成，音频分析检查可测量缺陷，人工听审判断音乐是否符合创作目标。

各模块的责任边界如下：

- 作曲模块是受信任、确定性的可执行配置。
- 乐器模块只能创建本地 Tone.js 节点并连接到指定输出。
- 渲染器独占 Chromium、浏览器网络隔离、`Tone.Offline`、目标路由和 WAV 写入。
- 发布工具独占最终 WAV、证据、清单和发布凭证的写入权。
- Hooks 阻止直接改写受保护产物，也会阻止在证据不完整时结束任务；Hooks 本身不证明艺术效果。

## 完整性与发布

所有生成文件名都包含当前音乐主体的 SHA-256 摘要。主体摘要包含会影响声音的源码和依赖，但不包含生成文件、听审记录以及只表示阶段意图的 `plan.contract.json`。因此，补充证据或把目标阶段切换到发布不会改变音频身份。

渲染凭证绑定乐谱、指标、分轨和混音的实际字节。发布凭证进一步绑定最终 WAV、音频证据、听审记录和清单。多文件写入使用排他 mutation journal；如果上次写入异常退出并留下 journal，后续操作会失败关闭，要求先核对产物状态。

发布前需要完整听完当前混音和相关分轨，并创建 `review/music-review.md`：

```text
sourceDigest: <当前源码摘要>
mixSha256: <当前混音文件摘要>
method: listened
findings: <具体听感、问题和处理结论>
```

随后把 `plan.contract.json` 的 `targetStage` 改为 `release`，再执行：

```bash
node "$PLUGIN_ROOT/scripts/tools/project-release.mjs" \
  "artifacts/music/demo-track"
```

只要源码、渲染凭证、混音摘要、数值阈值或听审记录有一项不匹配，发布就会失败。任何影响声音的源码修改都会使之前的生成物和听审记录失效。

## v1 支持范围

当前版本支持固定速度和拍号、十二平均律 MIDI 音高、合成器乐器、PCM16 WAV，以及三套数学评分配置。

以下能力暂不支持：采样素材、人声、外部网络资源、MIDI 导入导出、MP3 等母带编码、速度图、拍号变化和微分音。

## 开发与验证

在插件仓库根目录运行单元测试；仓库级校验会同时检查插件结构和 Skill：

```bash
node --test plugins/tonejs-music-production/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
```
