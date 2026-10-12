# 上线前风险报告（security/risk-report.md）

<!-- Fixture: minimal risk report written in the kit's Chinese wording (项目等级 / 已检查未发现 / 结论 /
     上期整改追踪 均取自中文资产措辞). Used by scripts/selftest.cjs as the regression fixture for the
     Chinese path of scripts/validate-coverage.cjs: the gate must reach the same verdict as for the
     equivalent English report. Keep the header block out of the body checks - no field-like literals
     in this comment, or the adversarial cases in selftest.cjs would match the wrong occurrence. -->

- 项目等级：L1
- 审查日期：2026-01-01
- 审查范围：src/
- 审查方式：仅静态检查
- 基线比对：无基线，本次按问卷重新定级

## P0 — 上线阻断（存在未修复的 P0 就不上线）
（无）

## P1 — 上线后一周内修复
（无）

## P2 — 建议项（可排期）
（无）

## 已检查未发现 / 不适用
- [已检查未发现] 密钥泄露：全仓检索密钥特征，未发现真实密钥。
- [已检查未发现] 认证：登录、注册接口使用 bcrypt 并有限流。
- [已检查未发现] 越权（IDOR）：每个带 ID 的接口都带归属条件。
- [已检查未发现] 注入：数据库访问全部走参数化查询。
- [已检查未发现] 部署与配置：未开启调试开关，错误页不回显堆栈。
- [快查未发现] 依赖与供应链：已查过 lock 文件与已安装版本。
- [本等级不适用] 业务逻辑与支付：L1 项目，不涉及资金。
- [快查未发现] 隐私与数据：未额外收集个人信息。
- [已检查未发现] AI 使用安全：未接入外部 AI 服务。
- [本等级不适用] 移动端与 APK：本仓库无移动端工程。

## 上期整改追踪（上一轮审查）
| 编号 | 上期结论 | 本次 | 证据 |
|---|---|---|---|
| P0-1 | 上期问题 | 已修复 | src/app.js:10 |

## Go / No-Go 上线结论
**结论：Go**
理由：本期清单未发现 P0。
下一步：修复完成后按需复审相关组。

## 机器可校验的覆盖记录（audit-coverage）
```json
{
  "report_version": 2,
  "level": "L1",
  "baseline_version": "v1",
  "go_no_go": "Go",
  "groups": {
    "A": { "status": "clean" },
    "B": { "status": "clean" },
    "C": { "status": "clean" },
    "D": { "status": "clean" },
    "E": { "status": "clean" },
    "F": { "status": "quick_clean" },
    "G": { "status": "not_applicable", "reason": "L1 项目不涉及资金" },
    "H": { "status": "quick_clean" },
    "I": { "status": "clean" },
    "J": { "status": "not_applicable", "reason": "本仓库无移动端工程" }
  }
}
```
