# Security

Please report security problems privately, not in public issues:
use [GitHub private vulnerability reporting](https://github.com/osntak/gerrit-lens/security/advisories/new) or email osntak@gmail.com.

Things that matter most here:

- the extension running on sites the user did not allow, or sending Gerrit data anywhere other than the user's own Gerrit and their local bridge
- markup or scripts from Gerrit content or AI notes getting into the page (comments, messages and notes are escaped before rendering)
- the bridge on `127.0.0.1:7357` answering web pages (it accepts only loopback hosts and, when an Origin is sent, only `chrome-extension://` origins)

You will get a reply within a week.

보안 문제는 공개 이슈 대신 위 비공개 신고나 메일로 알려 주세요.
