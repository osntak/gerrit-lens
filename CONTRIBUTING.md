# Contributing

Thanks for helping. [한국어는 아래에](#한국어)

## Before you start

- Bugs and ideas go to [Issues](https://github.com/osntak/gerrit-lens/issues). Include your Gerrit version (shown at the bottom of Gerrit pages) and whether Gerrit runs at the host root or under a path like `/r/`.
- Please never paste real code, names or addresses from a private Gerrit. A screenshot with those blurred is fine.

## Working on the code

```bash
git clone https://github.com/osntak/gerrit-lens.git
cd gerrit-lens
npm test          # core unit tests + bridge MCP/HTTP test, no install needed
```

Load the folder as an unpacked extension in `chrome://extensions` and allow your Gerrit from the popup.
After changing a content script file, press reload on the extension card and reload the Gerrit tab.

- No build step and no runtime dependencies. Keep it that way unless there is a strong reason.
- Logic that does not need the DOM goes in `core.js` with a test in `core.test.js`.
- UI words follow Gerrit for review actions and GitHub for screen parts. New strings need both `ko` and `en` in `core.js`.
- Screen changes should be checked on a real Gerrit change, not only in tests.
- Store images come from `store-assets/demo/` (made-up data). Retake them when the UI they show changes.

## Pull requests

One topic per pull request, with what you changed, why, and how you checked it.

---

## 한국어

- 버그와 제안은 [Issues](https://github.com/osntak/gerrit-lens/issues) 에 남겨 주세요. Gerrit 버전(Gerrit 페이지 맨 아래)과, Gerrit 이 주소 루트에 있는지 `/r/` 같은 하위 경로에 있는지 적어 주시면 빨라요.
- 사내 Gerrit 의 실제 코드, 이름, 주소는 붙이지 마세요. 가린 스크린샷은 괜찮아요.
- `npm test` 로 테스트가 돌고, 설치할 의존성은 없어요. DOM 이 필요 없는 로직은 `core.js` 에 넣고 `core.test.js` 에 테스트를 붙여요.
- 화면 문구는 리뷰 동작은 Gerrit, 화면 요소는 GitHub 용어를 따르고, 새 문구는 `core.js` 에 `ko`, `en` 둘 다 넣어요.
- 화면을 바꿨으면 실제 Gerrit change 에서 확인해 주세요.
