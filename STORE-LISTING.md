# Chrome 웹스토어 등록 절차 (전체 공개)

대시보드: https://chrome.google.com/webstore/devconsole

> 콘솔 UI 문구는 종종 바뀐다. 항목 이름이 조금 달라도 아래 순서와 내용은 그대로 적용된다.

## 0. 준비물

| 항목 | 상태 |
|---|---|
| 개발자 등록비 $5 | 결제 완료 (Changelink, gw-tweaks 와 같은 계정) |
| 업로드 zip | `npm run zip` -> `gerrit-lens-v<버전>.zip` (manifest.json 이 zip 루트에 있음) |
| 아이콘 128×128 (패키지) | `icons/icon128.png`, zip 에 포함 |
| 스토어 아이콘 128×128 | `store-assets/upload/store-icon-128.png` (가이드대로 96×96 그림 + 16px 투명 여백) |
| 스크린샷 1280×800 | `store-assets/upload/screenshot-*.jpg` (한국어 `-ko`, 영어 5장씩) |
| 작은 프로모션 타일 440×280 | `store-assets/upload/promo-small-440x280.jpg` |
| 마키 프로모션 타일 1400×560 | `store-assets/upload/promo-marquee-1400x560.jpg` |
| 개인정보처리방침 URL | https://github.com/osntak/gerrit-lens/blob/main/PRIVACY.md |

### 등록정보에 회사명, 사내 주소를 넣지 않는다

스크린샷은 실제 `lens.js` 를 가상 데이터(`acme/web-app`, 가상의 사람)로 돌린 화면이다. 다시 찍을 때는 아래처럼 한다.

```bash
python3 -m http.server 8766 --bind 127.0.0.1
# 다른 터미널에서, store-assets/ 안에서
# demo/demo.html?lang=ko|en&shot=overview|comments|ai|review 와 demo/popup-shot.html?lang=ko|en 을
# headless Chrome 으로 1280x800 캡처 (--window-size=1280,800 --force-device-scale-factor=1 --virtual-time-budget=12000)
```

타일은 `demo/promo.html?size=small|marquee|social` 을 같은 방식으로 캡처한다. 업로드용 JPG 는 PNG 를 RGB 로 변환해 `upload/` 에 둔다.

### 스크린샷 순서

| # | 파일 | 보여주는 것 |
|---|---|---|
| 1 | `screenshot-overview` | 헤더, 요약(리뷰어, 제출 조건, 관련 변경), 파일 목록, 분할 diff |
| 2 | `screenshot-comments` | 범위 코멘트, 스레드, 서식 툴바가 있는 코멘트 편집기 |
| 3 | `screenshot-ai` | AI 의견 카드 (설명, 참고 코드, 제안 코멘트, 초안으로 추가) |
| 4 | `screenshot-review` | 리뷰 창: 메시지, 라벨 투표, 초안 게시 |
| 5 | `screenshot-popup` | 팝업: 사이트 허용, 테마/언어, AI 의견 연결 두 단계 |

한국어 등록정보에는 `-ko` 파일을, 영어 등록정보에는 접미사 없는 파일을 올린다.

### 공개로 열기 전에 확인할 것

전체 공개를 선택하면 **게시자 이름과 연락 이메일이 스토어 항목에 표시된다.** 기존 확장과 같은 계정이면 이미 공개된 정보다.

## 1. 패키지 업로드

- 신규 등록: **새 항목** -> zip 업로드
- 버전 올리기: 항목 -> **패키지** -> **새 버전 업로드**

## 2. 스토어 등록정보

기본 언어는 영어, 한국어를 추가 언어로 넣는다. manifest 의 `default_locale` 이 `en` 이기 때문이다.

**이름** (manifest 에서 자동, 두 언어 같음)

```
Gerrit Lens
```

### English

**Summary** (max 132 chars)

```
A GitHub-style review screen for Gerrit change pages, with optional AI review notes from Claude Code or Codex next to the lines.
```

**Description**

```
Gerrit Lens puts a cleaner, GitHub-style review screen over Gerrit change pages. It reads the change through Gerrit's own REST API with the session you are already signed in with. There is no server in between and no extra account.

Unofficial. Not affiliated with the Gerrit project.

Reading a change
- File list with comment counts and a "Viewed" checkbox (the same flag as Gerrit's "Reviewed")
- Unified or split diff, syntax colors, changed characters inside a line, whitespace options
- Long unchanged runs fold away and open around comments
- Patchset and base selectors, including older patchsets
- Review summary: owner, reviewers and CC (add or remove), attention set, submit requirements, labels, topic, hashtags, relation chain, submitted together, same topic, conflicts with, merge conflict
- Conversation in one line per message, like Gerrit, with the inline comments of each review listed under it

Reviewing
- Comment on a line, on a selected range, or on a whole file. Reply, Quote, Ack, Done, edit or delete drafts
- Markdown toolbar, emoji, @mentions with suggestions, Ctrl/Cmd+Enter to save
- Unresolved threads from earlier patchsets show on the new patchset's lines
- Review dialog with votes and all drafts sent at once
- Gerrit's own actions with the same names: Submit, Rebase, Abandon, Restore, Revert, Mark as active, Cherry pick, Move change, Download patch, and more
- Keyboard shortcuts (press ? for the list)
- Copying code copies only the code, without markers or line numbers

AI review notes (optional)
A small local bridge connects Claude Code or Codex to the extension. When you ask your AI tool to review a Gerrit link, its notes appear as cards next to the lines. "Add as draft" turns a note into a normal Gerrit draft comment; nothing is published until you send your review. Setup is two steps in the popup: run one command (Node 18+), then allow the connection.

How to start
1. Open a change on your Gerrit site.
2. Click the extension icon and choose "Use on this site".
3. The change page opens in the new view. "Classic view" switches back, and the LENS button in Gerrit's header returns.

Supported
Gerrit 3.x with the PolyGerrit web UI, at the root of its host or under a sub-path such as /r/ or /gerrit/. Checked on Gerrit 3.8, 3.10 and 3.13. Large changes load each file as you scroll to it. Tabs added by Gerrit plugins (CI summaries and so on) are not shown; "Classic view" is one click away.

Permissions and data
- No site access at install time. Access is requested only for the Gerrit site you allow from the popup, and only that site gets the view.
- Requests go only to your Gerrit site and, if you enable AI notes, to the bridge on your own computer (127.0.0.1).
- No analytics, no ads, no remote code. Settings stay in the browser.
```

### 한국어

**요약** (최대 132자)

```
Gerrit change 페이지를 GitHub 처럼 읽기 쉬운 리뷰 화면으로 바꿔 보여줍니다. Claude Code 나 Codex 의 AI 리뷰 의견도 줄 옆에 띄울 수 있습니다.
```

**설명**

```
Gerrit Lens 는 Gerrit change 페이지 위에 GitHub 스타일의 리뷰 화면을 덮어 보여줍니다. 이미 로그인한 세션으로 Gerrit 의 REST API 를 직접 불러 데이터를 가져오며, 중간 서버나 따로 가입할 계정이 없습니다.

비공식 확장입니다. Gerrit 프로젝트와 관계없습니다.

change 읽기
- 파일 목록: 코멘트 수, "확인함" 체크 (Gerrit 의 Reviewed 표시와 같은 값)
- 통합/분할 diff, 구문 강조, 줄 안에서 바뀐 글자 표시, 공백 비교 설정
- 바뀌지 않은 긴 구간은 접어 두고, 코멘트가 걸린 곳은 펼쳐 둡니다
- 패치셋, 기준 패치셋 선택 (이전 패치셋 포함)
- 리뷰 요약: 작성자, 리뷰어/참조 (추가, 제거), 차례(attention set), 제출 조건, 라벨, 토픽, 해시태그, 관련 변경, 함께 머지될 변경, 같은 토픽, 충돌하는 변경, 머지 충돌
- 대화 목록은 Gerrit 처럼 메시지마다 한 줄이고, 누르면 펼쳐져 그 리뷰에서 단 코멘트까지 보여줍니다

리뷰하기
- 줄, 드래그한 범위, 파일 전체에 코멘트. 답글, 인용, Ack, Done, 초안 수정/삭제
- 서식 툴바, 이모지, @멘션 자동완성, Ctrl/Cmd+Enter 저장
- 이전 패치셋의 미해결 스레드는 새 패치셋의 해당 줄에 옮겨 보여줍니다
- 리뷰 창에서 투표와 초안 일괄 게시
- Gerrit 이 허용하는 동작을 같은 이름으로 제공: Submit, Rebase, Abandon, Restore, Revert, Mark as active, Cherry pick, Move change, Download patch 등
- 키보드 단축키 (? 로 목록 보기)
- 코드를 복사하면 +/- 표시나 줄 번호 없이 코드만 복사됩니다

AI 리뷰 의견 (선택)
내 컴퓨터에서 도는 작은 브리지가 Claude Code 나 Codex 와 확장을 이어 줍니다. AI 도구에 Gerrit 링크를 주고 리뷰를 부탁하면 의견이 diff 줄 옆에 카드로 뜹니다. "초안으로 추가" 를 누르면 일반 Gerrit 초안 코멘트가 되고, 리뷰를 보내기 전에는 게시되지 않습니다. 설정은 팝업의 두 단계입니다. 명령 한 줄 실행(Node 18 이상), 그리고 연결 허용.

시작하기
1. 사용하는 Gerrit 에서 change 를 엽니다.
2. 확장 아이콘을 누르고 "이 사이트에서 사용" 을 누릅니다.
3. change 페이지가 새 화면으로 열립니다. "클래식 보기" 로 원래 화면으로 돌아가고, Gerrit 상단 헤더의 LENS 로 다시 들어옵니다.

지원 범위
PolyGerrit 웹 UI 를 쓰는 Gerrit 3.x 에서 동작합니다. 주소 루트에 있는 Gerrit 과 /r/, /gerrit/ 같은 하위 경로에 있는 Gerrit 모두 됩니다. Gerrit 3.8, 3.10, 3.13 에서 확인했습니다. 파일이 많은 change 는 스크롤하면서 파일별로 불러옵니다. Gerrit 플러그인이 붙이는 탭(CI 요약 등)은 보여주지 않으며, "클래식 보기" 로 바로 볼 수 있습니다.

권한과 데이터
- 설치할 때는 어떤 사이트 권한도 받지 않습니다. 팝업에서 허용한 Gerrit 사이트에만 권한을 요청하고, 그 사이트에서만 동작합니다.
- 요청은 사용자의 Gerrit 사이트와, AI 의견을 켠 경우 내 컴퓨터의 브리지(127.0.0.1)로만 갑니다.
- 분석 도구, 광고, 원격 코드가 없습니다. 설정은 브라우저 안에만 저장됩니다.
```

- **카테고리**: 개발자 도구 (Developer Tools)
- **언어**: English (기본), 한국어

> "지원 범위" 문단을 반드시 넣는다. 플러그인 탭이 안 보이는 이유를 모르면 낮은 평점으로 돌아온다.

## 3. 개인정보 보호 탭

**단일 목적 설명** (영어로 입력)

```
Shows Gerrit change pages in a more readable review screen and lets the user review from it, optionally with AI review notes from a bridge running on the user's own computer.
```

**권한 사용 정당화**

| 권한 | 정당화 (영어로 입력) |
|---|---|
| `storage` | Saves the user's settings in the browser: on/off, theme, language, diff view, whitespace and file list choices. Nothing is sent anywhere. |
| `scripting` | Registers the review screen script only on the Gerrit sites the user allowed from the popup. Removing the site removes the registration. |
| `activeTab` | Lets the popup read the current tab's address so it can offer "Use on this site" for that Gerrit site and show whether it is enabled. |
| Optional host permissions (`http://*/*`, `https://*/*`) | Every organization runs Gerrit on its own address, so no site can be listed in advance. Access is optional and requested only when the user clicks "Use on this site" for their Gerrit, or "Allow connection" for the local bridge at http://127.0.0.1. Nothing is granted at install time. |

**원격 코드 사용**: **아니오**. highlight.js 11.9.0 을 포함한 모든 코드가 패키지 안에 있다 (`vendor/`).

**데이터 사용 공개**

- 확장은 사용자의 Gerrit 사이트에서 change, diff, 코멘트(웹사이트 콘텐츠)를 읽고, 사용자가 누를 때만 코멘트, 투표를 Gerrit 에 쓴다. 이 데이터는 개발자를 포함한 제3자에게 전송되지 않는다.
- 콘솔에서 "웹사이트 콘텐츠" 를 체크해야 하는지는 콘솔 안내 문구를 보고 정한다. 수집의 정의가 "기기 밖으로 개발자나 제3자에게 전송" 이면 해당 없음이다. 애매하면 체크하고 아래 3개 항목을 모두 체크한다.
  - 승인된 용도로만 데이터를 사용한다
  - 제3자에게 데이터를 판매하지 않는다
  - 신용도 판단이나 대출 목적으로 사용하지 않는다

**개인정보처리방침 URL**: 로그인 세션으로 사이트 콘텐츠를 다루므로 넣는다. https://github.com/osntak/gerrit-lens/blob/main/PRIVACY.md

**홈페이지 URL** (선택): https://github.com/osntak/gerrit-lens

## 4. 배포 탭

| 옵션 | 설명 |
|---|---|
| **공개(Public)** | 누구나 검색, 설치. 게시자 정보가 표시됨 |
| 비공개(Unlisted) | 링크 아는 사람만 설치 |
| 비공개(Private) | 등록한 테스터만 설치 |

배포 지역은 전체로 둔다.

## 5. 제출

1. 오른쪽 위 **초안 저장**
2. **검토를 위해 제출**
3. 필수 항목이 비어 있으면 제출 버튼이 눌리지 않고 상단에 오류 목록이 뜬다

> 선택 호스트 권한이 넓으면(`http://*/*`) 심사가 며칠 더 걸릴 수 있다. Changelink 도 같은 방식으로 통과했다.

## 6. 같이 할 것

- `gerrit-lens-bridge` npm 게시: 0.1.0 게시 완료 (2026-11-16).
