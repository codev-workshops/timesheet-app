# Consolidated Security Backlog

Generated 2026-09-24 from scans of two repositories. Severity is the scanner-assigned severity (npm audit for
timesheet-app; OWASP Dependency-Check / NVD for uc-cve-remediation-regulatory-compliance). Each row is one
advisory (a single vulnerable package may appear on several rows). CVSS is the base score reported by the
scanner (`n/a` where the advisory has no CVSS vector yet).

## Scan inventory

| Repo | Scanner | Command | Result |
|---|---|---|---|
| timesheet-app (`backend/`) | npm audit | `npm audit --json` | 23 advisories (1 critical, 13 high, 6 moderate, 3 low) |
| timesheet-app (`frontend/`) | npm audit | `npm audit --json` | 20 advisories (0 critical, 14 high, 5 moderate, 1 low) |
| timesheet-app (`frontend/`) | ESLint 9 (typescript-eslint, react-hooks, react-refresh) | `npx eslint . --format json` | 0 violations |
| timesheet-app (`backend/`) | ESLint | `npx eslint . --format json` | no ESLint config in `backend/` — nothing to lint (see note) |
| uc-cve-remediation-regulatory-compliance | OWASP Dependency-Check 12.1.3 (CLI) | `./gradlew dependencyCheckAnalyze` (see note) | 154 CVEs |

Notes:
- `./gradlew dependencyCheckAnalyze` as configured in `build.gradle` (plugin 7.4.4) fails: it downloads the retired
  NVD 1.1 JSON feeds (`nvd.nist.gov/feeds/json/cve/1.1/*` → HTTP 403). Newer plugin versions (9.x–12.x) cannot run
  on the repo's Gradle 7.4 wrapper (Gradle 7.4's ASM rejects the Java 19 classes in jackson-core 2.15+). The scan was
  therefore executed with the OWASP Dependency-Check 12.1.3 CLI (NVD API 2.0) against the project's resolved
  `runtimeClasspath` (112 jars exported via an init script) plus `build.gradle`. Same engine, same NVD data.
- `backend/` has no ESLint configuration and no `lint` script; `npx eslint .` therefore reports 0 findings only
  because no rules are enabled. Adding an ESLint config (e.g. `eslint-plugin-security`) is a backlog item.

## Totals by severity

| Severity | Count |
|---|---|
| CRITICAL | 39 |
| HIGH | 164 |
| MEDIUM | 73 |
| LOW (listed for completeness) | 10 |

## Totals by repo

| Repo | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| timesheet-app | 12 | 100 | 17 | 3 |
| uc-cve-remediation-regulatory-compliance | 27 | 64 | 56 | 7 |

## CRITICAL (39)

| Repo | Dependency / file | CVE / rule ID | CVSS | Title |
|---|---|---|---|---|
| timesheet-app | `backend` → `tar@<=7.5.3` (transitive) | CVE-2026-23950 / GHSA-r6q2-hw4h-h46w | 8.8 | Race Condition in node-tar Path Reservations via Unicode Ligature Collisions on macOS APFS |
| timesheet-app | `backend` → `tar@<7.5.7` (transitive) | CVE-2026-24842 / GHSA-34x7-hfp2-rc4v | 8.2 | node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal |
| timesheet-app | `backend` → `tar@<=7.5.17` (transitive) | CVE-2026-59874 / GHSA-8x88-c5mf-7j5w | 7.5 | node-tar: Negative tar entry size causes infinite loop in archive replace |
| timesheet-app | `backend` → `tar@<=7.5.18` (transitive) | CVE-2026-59873 / GHSA-23hp-3jrh-7fpw | 7.5 | node-tar: Decompression/parse DoS via unlimited input |
| timesheet-app | `backend` → `tar@<=7.5.20` (transitive) | CVE-2026-73566 / GHSA-r292-9mhp-454m | 7.5 | node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow DoS via crafted long-path tar with member selection |
| timesheet-app | `backend` → `tar@<7.5.8` (transitive) | CVE-2026-26960 / GHSA-83g3-92jg-28cx | 7.1 | Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar Extraction |
| timesheet-app | `backend` → `tar@<=7.5.16` (transitive) | CVE-2026-59875 / GHSA-gvwx-54wh-qm9j | 5.3 | node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records |
| timesheet-app | `backend` → `tar@<=7.5.17` (transitive) | CVE-2026-59871 / GHSA-w8wr-v893-vjvp | 5.3 | node-tar: Process crash via PAX numeric path type confusion |
| timesheet-app | `backend` → `tar@<=7.5.10` (transitive) | CVE-2026-31802 / GHSA-9ppj-qmqm-q256 | n/a | node-tar Symlink Path Traversal via Drive-Relative Linkpath |
| timesheet-app | `backend` → `tar@<=7.5.15` (transitive) | CVE-2026-53655 / GHSA-vmf3-w455-68vh | n/a | node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causing tar parser interpretation differential (file smuggling) |
| timesheet-app | `backend` → `tar@<=7.5.2` (transitive) | CVE-2026-23745 / GHSA-8qq5-rm4j-mr97 | n/a | node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficient Path Sanitization |
| timesheet-app | `backend` → `tar@<=7.5.9` (transitive) | CVE-2026-29786 / GHSA-qffp-2rhf-9h96 | n/a | tar has Hardlink Path Traversal via Drive-Relative Linkpath |
| uc-cve-remediation-regulatory-compliance | `kotlin-stdlib-1.6.10.jar` | CVE-2026-53914 | 9.8 | In JetBrains Kotlin before 2.4.20 code execution was possible via unsafe deserialization in the build cache metadata |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-1471 | 9.8 | SnakeYaml's Constructor() class does not restrict types which can be instantiated during deserialization. Deserializing yaml content provide |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2016-1000027 | 9.8 | Pivotal Spring Framework through 5.3.16 suffers from a potential remote code execution (RCE) issue if used for Java deserialization of untru |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2022-22965 | 9.8 | A Spring MVC or Spring WebFlux application running on JDK 9+ may be vulnerable to remote code execution (RCE) via data binding. The specific |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41855 | 9.8 | In an untrusted JMS environment, org.springframework.jms.support.converter.MappingJackson2MessageConverter and org.springframework.jms.suppo |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47884 | 9.8 | Use of XsltView in a Spring MVC application can result in SSRF and RCE attack if the application has an "/**" mapping that results in view r |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47891 | 9.8 | A Spring WebFlux application that relies on the Aalto XML processor to parse XML input does not correctly enforce the maxInMemorySize limit. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47892 | 9.8 | A WebFlux application using functional endpoints and deployed with DispatcherServlet may be vulnerable to a header predicate bypass in a pre |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-59313 | 9.8 | Spring MVC applications using the functional web framework are vulnerable to stream corruption when using Server-Sent Events (SSE). |
| uc-cve-remediation-regulatory-compliance | `sqlite-jdbc-3.36.0.3.jar` | CVE-2023-32697 | 9.8 | SQLite JDBC is a library for accessing and creating SQLite database files in Java. Sqlite-jdbc addresses a remote code execution vulnerabili |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-50379 | 9.8 | Time-of-check Time-of-use (TOCTOU) Race Condition vulnerability during JSP compilation in Apache Tomcat permits an RCE on case insensitive f |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-52316 | 9.8 | Unchecked Error Condition vulnerability in Apache Tomcat. If Tomcat is configured to use a custom Jakarta Authentication (formerly JASPIC) S |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-56337 | 9.8 | Time-of-check Time-of-use (TOCTOU) Race Condition vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-24813 | 9.8 | Path Equivalence: 'file.Name' (Internal Dot) leading to Remote Code Execution and/or Information disclosure and/or malicious content added t |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-31651 | 9.8 | Improper Neutralization of Escape, Meta, or Control Sequences vulnerability in Apache Tomcat. For a subset of unlikely rewrite rule configur |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-41293 | 9.8 | Improper Input Validation vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-43512 | 9.8 | DEPRECATED: Authentication Bypass Issues vulnerability in digest authentication in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-65905 | 9.8 | Authentication Bypass by Capture-replay vulnerability in Apache Tomcat's DIGEST authenticator. If, before windowSize requests have been made |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-55754 | 9.6 | Improper Neutralization of Escape, Meta, or Control Sequences vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-59283 | 9.1 | Applications that evaluate Spring Expression Language (SpEL) expressions using SimpleEvaluationContext may be vulnerable to a safety guard b |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-66614 | 9.1 | Improper Input Validation vulnerability. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-43515 | 9.1 | Improper Authorization vulnerability when multiple method constraints define an HTTP method for the same extension in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-55276 | 9.1 | Always-Incorrect Control Flow Implementation vulnerability in Apache Tomcat meant that special roles and empty authorisation constraints wer |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-59083 | 9.1 | Improper Handling of URL Encoding (Hex Encoding) vulnerability in Apache Tomcat's rewrite valve allowed security constraint bypass for some  |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-59084 | 9.1 | Insufficient Technical Documentation vulnerability in Apache Tomcat since the requirements to securely configure the EncryptInterceptor were |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-65182 | 9.1 | Improper Access Control, Incorrect Authorization vulnerability in Apache Tomcat leads to security constraint bypass if a constraint for a lo |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-68525 | 9.1 | Incorrect Authorization vulnerability in Apache Tomcat's FORM authentication process allows the bypassing of a security constraint that limi |

## HIGH (164)

| Repo | Dependency / file | CVE / rule ID | CVSS | Title |
|---|---|---|---|---|
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.16.0` (direct) | CVE-2026-44494 / GHSA-35jp-ww65-95wh | 8.7 | axios Vulnerable to Full Man-in-the-Middle via Prototype Pollution Gadget in `config.proxy` |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <7.12.0` (transitive) | CVE-2026-21884 / GHSA-8v8x-cx79-35w7 | 8.2 | React Router SSR XSS in ScrollRestoration |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <=7.14.1` (transitive) | CVE-2026-42211 / GHSA-49rj-9fvp-4h2h | 8.1 | React Router's vendored turbo-stream v2 allows arbitrary constructor invocation via TYPE_ERROR deserialization leading to Unauth RCE |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <=7.11.0` (transitive) | CVE-2026-22029 / GHSA-2w69-qvjg-hvjx | 8.0 | React Router vulnerable to XSS via Open Redirects |
| timesheet-app | `frontend` → `react-router@>=7.7.0 <7.13.2` (transitive) | CVE-2026-33245 / GHSA-8646-j5j9-6r62 | 8.0 | React Router vulnerable to XSS in unstable RSC redirect handling via javascript: redirect targets |
| timesheet-app | `backend` → `brace-expansion@<1.1.17` (transitive) | CVE-2026-14257 / GHSA-mh99-v99m-4gvg | 7.5 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash |
| timesheet-app | `backend` → `brace-expansion@<1.1.18` (transitive) | CVE-2026-69152 / GHSA-rgw5-rvv9-x895 | 7.5 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation |
| timesheet-app | `backend` → `browserslist@<=4.28.6` (transitive) | CVE-2026-73089 / GHSA-c83g-rgw3-j3cx | 7.5 | Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM |
| timesheet-app | `backend` → `browserslist@<=4.28.6` (transitive) | CVE-2026-73088 / GHSA-73wf-gq98-2v4g | 7.5 | Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) |
| timesheet-app | `backend` → `form-data@>=4.0.0 <4.0.6` (transitive) | CVE-2026-12143 / GHSA-hmw2-7cc7-3qxx | 7.5 | form-data: CRLF injection in form-data via unescaped multipart field names and filenames |
| timesheet-app | `backend` → `js-yaml@>=3.0.0 <3.15.0` (transitive) | CVE-2026-59869 / GHSA-52cp-r559-cp3m | 7.5 | js-yaml: YAML merge-key chains can force quadratic CPU consumption |
| timesheet-app | `backend` → `js-yaml@>=3.0.0 <3.15.1` (transitive) | GHSA-5p4m-2wfm-xmqj | 7.5 | JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported |
| timesheet-app | `backend` → `js-yaml@>=3.0.0 <3.15.2` (transitive) | CVE-2026-84375 / GHSA-2883-xcg3-v3hh | 7.5 | js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources |
| timesheet-app | `backend` → `jws@<3.2.3` (transitive) | CVE-2025-65945 / GHSA-869p-cjfg-cm3x | 7.5 | auth0/node-jws Improperly Verifies HMAC Signature |
| timesheet-app | `backend` → `minimatch@<3.1.3` (transitive) | CVE-2026-27903 / GHSA-7r86-cg39-jmmj | 7.5 | minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments |
| timesheet-app | `backend` → `minimatch@<3.1.4` (transitive) | CVE-2026-27904 / GHSA-23c5-xmqv-rm74 | 7.5 | minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions |
| timesheet-app | `backend` → `path-to-regexp@<0.1.13` (transitive) | CVE-2026-4867 / GHSA-37ch-88jc-xwx2 | 7.5 | path-to-regexp vulnerable to Regular Expression Denial of Service via multiple route parameters |
| timesheet-app | `backend` → `picomatch@<2.3.2` (transitive) | CVE-2026-33671 / GHSA-c2c7-rcm5-vvqj | 7.5 | Picomatch has a ReDoS vulnerability via extglob quantifiers |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42039 / GHSA-62hf-57xw-28j9 | 7.5 | Axios: unbounded recursion in toFormData causes DoS via deeply nested request data |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.16.0` (direct) | CVE-2026-44496 / GHSA-hfxv-24rg-xrqf | 7.5 | Axios: Regular Expression Denial of Service (ReDoS) via Cookie Name Injection |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.16.0` (direct) | CVE-2026-44486 / GHSA-j5f8-grm9-p9fc | 7.5 | Axios: Proxy-Authorization header leaks to redirect target when proxy is re-evaluated to direct connection |
| timesheet-app | `frontend` → `axios@>=1.0.0 <=1.13.4` (direct) | CVE-2026-25639 / GHSA-43fc-jf86-j433 | 7.5 | Axios is Vulnerable to Denial of Service via __proto__ Key in mergeConfig |
| timesheet-app | `frontend` → `axios@>=1.7.0 <1.16.0` (direct) | CVE-2026-44488 / GHSA-777c-7fjr-54vf | 7.5 | Allocation of Resources Without Limits or Throttling in Axios |
| timesheet-app | `frontend` → `brace-expansion@<1.1.17` (transitive) | CVE-2026-14257 / GHSA-mh99-v99m-4gvg | 7.5 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash |
| timesheet-app | `frontend` → `brace-expansion@<1.1.18` (transitive) | CVE-2026-69152 / GHSA-rgw5-rvv9-x895 | 7.5 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation |
| timesheet-app | `frontend` → `brace-expansion@>=2.0.0 <2.1.3` (transitive) | CVE-2026-14257 / GHSA-mh99-v99m-4gvg | 7.5 | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash |
| timesheet-app | `frontend` → `brace-expansion@>=2.0.0 <2.1.4` (transitive) | CVE-2026-69152 / GHSA-rgw5-rvv9-x895 | 7.5 | brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation |
| timesheet-app | `frontend` → `browserslist@<=4.28.6` (transitive) | CVE-2026-73089 / GHSA-c83g-rgw3-j3cx | 7.5 | Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM |
| timesheet-app | `frontend` → `browserslist@<=4.28.6` (transitive) | CVE-2026-73088 / GHSA-73wf-gq98-2v4g | 7.5 | Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) |
| timesheet-app | `frontend` → `flatted@<3.4.0` (transitive) | CVE-2026-32141 / GHSA-25h7-pfq9-p65f | 7.5 | flatted vulnerable to unbounded recursion DoS in parse() revive phase |
| timesheet-app | `frontend` → `form-data@>=4.0.0 <4.0.6` (transitive) | CVE-2026-12143 / GHSA-hmw2-7cc7-3qxx | 7.5 | form-data: CRLF injection in form-data via unescaped multipart field names and filenames |
| timesheet-app | `frontend` → `js-yaml@>=4.0.0 <4.3.0` (transitive) | CVE-2026-59869 / GHSA-52cp-r559-cp3m | 7.5 | js-yaml: YAML merge-key chains can force quadratic CPU consumption |
| timesheet-app | `frontend` → `js-yaml@>=4.0.0 <4.3.1` (transitive) | GHSA-5p4m-2wfm-xmqj | 7.5 | JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported |
| timesheet-app | `frontend` → `js-yaml@>=4.0.0 <4.3.2` (transitive) | CVE-2026-84375 / GHSA-2883-xcg3-v3hh | 7.5 | js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources |
| timesheet-app | `frontend` → `minimatch@<3.1.3` (transitive) | CVE-2026-27903 / GHSA-7r86-cg39-jmmj | 7.5 | minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments |
| timesheet-app | `frontend` → `minimatch@<3.1.4` (transitive) | CVE-2026-27904 / GHSA-23c5-xmqv-rm74 | 7.5 | minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions |
| timesheet-app | `frontend` → `minimatch@>=9.0.0 <9.0.7` (transitive) | CVE-2026-27903 / GHSA-7r86-cg39-jmmj | 7.5 | minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments |
| timesheet-app | `frontend` → `minimatch@>=9.0.0 <9.0.7` (transitive) | CVE-2026-27904 / GHSA-23c5-xmqv-rm74 | 7.5 | minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions |
| timesheet-app | `frontend` → `picomatch@>=4.0.0 <4.0.4` (transitive) | CVE-2026-33671 / GHSA-c2c7-rcm5-vvqj | 7.5 | Picomatch has a ReDoS vulnerability via extglob quantifiers |
| timesheet-app | `frontend` → `postcss@<=8.5.11` (transitive) | CVE-2026-45623 / GHSA-6g55-p6wh-862q | 7.5 | PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments |
| timesheet-app | `frontend` → `postcss@<=8.5.17` (transitive) | CVE-2026-73646 / GHSA-r28c-9q8g-f849 | 7.5 | PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <7.14.0` (transitive) | CVE-2026-34077 / GHSA-rxv8-25v2-qmq8 | 7.5 | React Router vulnerable to Denial of Service via reflected user input in single-fetch |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <7.15.0` (transitive) | CVE-2026-42342 / GHSA-8x6r-g9mw-2r78 | 7.5 | React Router vulnerable to DoS via unbounded path expansion in __manifest endpoint |
| timesheet-app | `frontend` → `vite@>=7.0.0 <=7.3.4` (direct) | CVE-2026-53571 / GHSA-fx2h-pf6j-xcff | 7.5 | vite: `server.fs.deny` bypass on Windows alternate paths |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42033 / GHSA-pf86-5x62-jrwf | 7.4 | Axios: Prototype Pollution Gadgets - Response Tampering, Data Exfiltration, and Request Hijacking |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42035 / GHSA-6chq-wfr3-2hj9 | 7.4 | Axios: Header Injection via Prototype Pollution |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.2` (direct) | CVE-2026-42264 / GHSA-q8qp-cvcw-x6jj | 7.4 | Axios has prototype pollution read-side gadgets in HTTP adapter that allow credential injection and request hijacking |
| timesheet-app | `frontend` → `nanoid@<3.3.12` (transitive) | CVE-2026-73086 / GHSA-xwg4-73v4-xw9w | 7.4 | nanoid: Integer Overflow or Wraparound |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42043 / GHSA-pmwg-cvhr-8vh7 | 7.2 | Axios: Incomplete Fix for CVE-2025-62718 — NO_PROXY Protection Bypassed via RFC 1122 Loopback Subnet (127.0.0.0/8) in Axios 1.15.0 |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.2` (direct) | CVE-2026-44495 / GHSA-3g43-6gmg-66jw | 7.0 | axios Vulnerable to Credential Theft and Response Hijacking via Prototype Pollution Gadget in Config Merge |
| timesheet-app | `frontend` → `react-router@>=7.9.6 <=7.12.0` (transitive) | CVE-2026-53668 / GHSA-jjmj-jmhj-qwj2 | 6.9 | React Router: Open redirect leading to XSS |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42038 / GHSA-m7pr-hjqh-92cm | 6.8 | Axios: no_proxy bypass via IP alias allows SSRF |
| timesheet-app | `backend` → `brace-expansion@<1.1.13` (transitive) | CVE-2026-33750 / GHSA-f886-m6hf-6m8v | 6.5 | brace-expansion: Zero-step sequence causes process hang and memory exhaustion |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.2` (direct) | CVE-2026-42044 / GHSA-3w6x-2g7m-8v23 | 6.5 | Axios: Invisible JSON Response Tampering via Prototype Pollution Gadget in `parseReviver` |
| timesheet-app | `frontend` → `brace-expansion@<1.1.13` (transitive) | CVE-2026-33750 / GHSA-f886-m6hf-6m8v | 6.5 | brace-expansion: Zero-step sequence causes process hang and memory exhaustion |
| timesheet-app | `frontend` → `brace-expansion@>=2.0.0 <2.0.3` (transitive) | CVE-2026-33750 / GHSA-f886-m6hf-6m8v | 6.5 | brace-expansion: Zero-step sequence causes process hang and memory exhaustion |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <=7.11.0` (transitive) | CVE-2026-22030 / GHSA-h5cw-625j-3rxh | 6.5 | React Router has CSRF issue in Action/Server Action Request Processing |
| timesheet-app | `frontend` → `postcss@<8.5.10` (transitive) | CVE-2026-41305 / GHSA-qx2v-qp2m-jg93 | 6.1 | PostCSS has XSS via Unescaped </style> in its CSS Stringify Output |
| timesheet-app | `frontend` → `react-router@>=6.4.0 <7.18.0` (transitive) | CVE-2026-53666 / GHSA-337j-9hxr-rhxg | 6.1 | React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration |
| timesheet-app | `frontend` → `nanoid@<3.3.16` (transitive) | CVE-2026-67214 / GHSA-28wg-ghj8-5hjv | 5.9 | nanoid: non-secure generators can loop indefinitely with negative size |
| timesheet-app | `frontend` → `nanoid@<3.3.18` (transitive) | CVE-2026-67213 / GHSA-2v37-7h3g-55p8 | 5.9 | nanoid: custom generators can loop indefinitely when size is zero |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42042 / GHSA-xx6v-rp6x-q39c | 5.4 | Axios: XSRF Token Cross-Origin Leakage via Prototype Pollution Gadget in `withXSRFToken` Boolean Coercion |
| timesheet-app | `frontend` → `react-router@>=7.5.1 <7.13.2` (transitive) | CVE-2026-33244 / GHSA-f22v-gfqf-p8f3 | 5.4 | React Router has stored XSS via unescaped Location header in prerendered redirect HTML |
| timesheet-app | `backend` → `brace-expansion@<1.1.16` (transitive) | CVE-2026-13149 / GHSA-3jxr-9vmj-r5cp | 5.3 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups |
| timesheet-app | `backend` → `js-yaml@<3.15.0` (transitive) | CVE-2026-53550 / GHSA-h67p-54hq-rp68 | 5.3 | JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases |
| timesheet-app | `backend` → `picomatch@<2.3.2` (transitive) | CVE-2026-33672 / GHSA-3v7f-55p6-f55p | 5.3 | Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42037 / GHSA-445q-vr5w-6q77 | 5.3 | Axios: CRLF Injection in multipart/form-data body via unsanitized blob.type in formDataToStream |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42034 / GHSA-5c9x-8gcm-mpgx | 5.3 | Axios' HTTP adapter-streamed uploads bypass maxBodyLength when maxRedirects: 0 |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42036 / GHSA-vf2m-468p-8v99 | 5.3 | Axios: HTTP adapter streamed responses bypass maxContentLength |
| timesheet-app | `frontend` → `brace-expansion@<1.1.16` (transitive) | CVE-2026-13149 / GHSA-3jxr-9vmj-r5cp | 5.3 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups |
| timesheet-app | `frontend` → `brace-expansion@>=2.0.0 <2.1.2` (transitive) | CVE-2026-13149 / GHSA-3jxr-9vmj-r5cp | 5.3 | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups |
| timesheet-app | `frontend` → `js-yaml@>=4.0.0 <=4.1.1` (transitive) | CVE-2026-53550 / GHSA-h67p-54hq-rp68 | 5.3 | JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases |
| timesheet-app | `frontend` → `picomatch@>=4.0.0 <4.0.4` (transitive) | CVE-2026-33672 / GHSA-3v7f-55p6-f55p | 5.3 | Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.0` (direct) | CVE-2025-62718 / GHSA-3p68-rc4w-qgx5 | 4.8 | Axios has a NO_PROXY Hostname Normalization Bypass that Leads to SSRF |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.0` (direct) | CVE-2026-40175 / GHSA-fvcv-3m26-pcqx | 4.8 | Axios has Unrestricted Cloud Metadata Exfiltration via Header Injection Chain |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42041 / GHSA-w9j2-pvgh-6h63 | 4.8 | Axios: Authentication Bypass via Prototype Pollution Gadget in `validateStatus` Merge Strategy |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.16.0` (direct) | CVE-2026-44490 / GHSA-898c-q2cr-xwhg | 4.8 | axios has DoS & Header Injection via Prototype Pollution Read-Side Gadgets in axios merge functions |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.15.1` (direct) | CVE-2026-42040 / GHSA-xhjh-pmcv-23jw | 3.7 | Axios: Null Byte Injection via Reverse-Encoding in AxiosURLSearchParams |
| timesheet-app | `backend` → `ip-address@<=10.1.0` (transitive) | CVE-2026-42338 / GHSA-v2v4-37r5-5v8g | n/a | ip-address has XSS in Address6 HTML-emitting methods |
| timesheet-app | `backend` → `ip-address@<=10.3.0` (transitive) | CVE-2026-69192 / GHSA-mwp4-54f8-5fhr | n/a | ip-address: Address4 decodes leading-zero octets as decimal while resolvers decode them as octal, allowing SSRF and trust-boundary bypass |
| timesheet-app | `backend` → `minimatch@<3.1.3` (transitive) | CVE-2026-26996 / GHSA-3ppc-4f35-3m26 | n/a | minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.16.0` (direct) | CVE-2026-44487 / GHSA-p92q-9vqr-4j8v | n/a | Axios: Proxy-Authorization Credential Leak to Origin Server Across HTTP-to-HTTPS Redirect in Axios Node.js HTTP Adapter |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.18.0` (direct) | CVE-2026-67316 / GHSA-mmx7-hfxf-jppx | n/a | Axios: Prototype pollution gadgets can alter axios request construction |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.18.0` (direct) | CVE-2026-67312 / GHSA-pmv8-rq9r-6j72 | n/a | Axios: Deep formToJSON Key Recursion Can Cause Denial of Service |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.18.0` (direct) | CVE-2026-67319 / GHSA-7q8q-rj6j-mhjq | n/a | Axios: Nested axios option objects can consume polluted prototype values |
| timesheet-app | `frontend` → `axios@>=1.0.0 <1.18.0` (direct) | CVE-2026-67313 / GHSA-42h9-826w-cgv3 | n/a | Axios: Excessive recursion in formDataToJSON can cause denial of service |
| timesheet-app | `frontend` → `axios@>=1.13.0 <1.18.0` (direct) | CVE-2026-67318 / GHSA-mwf2-3pr3-8698 | n/a | Axios: HTTP/2 streamed uploads bypass `maxBodyLength` |
| timesheet-app | `frontend` → `axios@>=1.7.0 <1.18.0` (direct) | CVE-2026-67317 / GHSA-jqh4-m9w3-8hp9 | n/a | Axios: Fetch adapter `ReadableStream` uploads bypass `maxBodyLength` |
| timesheet-app | `frontend` → `flatted@<=3.4.1` (transitive) | CVE-2026-33228 / GHSA-rf6f-7fwh-wjgh | n/a | Prototype Pollution via parse() in NodeJS flatted |
| timesheet-app | `frontend` → `minimatch@<3.1.3` (transitive) | CVE-2026-26996 / GHSA-3ppc-4f35-3m26 | n/a | minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern |
| timesheet-app | `frontend` → `minimatch@>=9.0.0 <9.0.6` (transitive) | CVE-2026-26996 / GHSA-3ppc-4f35-3m26 | n/a | minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern |
| timesheet-app | `frontend` → `postcss@<=8.5.22` (transitive) | CVE-2026-69153 / GHSA-fxqj-rqcc-2cmp | n/a | PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset |
| timesheet-app | `frontend` → `react-router@>=6.0.0 <7.18.0` (transitive) | CVE-2026-53669 / GHSA-wrjc-x8rr-h8h6 | n/a | React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass) |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <7.14.1` (transitive) | CVE-2026-40181 / GHSA-2j2x-hqr9-3h42 | n/a | React Router's same-origin redirect with path starting // causes open redirect via protocol-relative URL reinterpretation |
| timesheet-app | `frontend` → `react-router@>=7.0.0 <7.18.0` (transitive) | CVE-2026-55685 / GHSA-chx6-hx7r-mcp5 | n/a | React Router: Unauthenticated Denial of Service via Inefficient Route Matching |
| timesheet-app | `frontend` → `rollup@>=4.0.0 <4.59.0` (transitive) | CVE-2026-27606 / GHSA-mw96-cpmx-2vgc | n/a | Rollup 4 has Arbitrary File Write via Path Traversal |
| timesheet-app | `frontend` → `vite@>=7.0.0 <=7.3.1` (direct) | CVE-2026-39365 / GHSA-4w7w-66w2-5vf9 | n/a | Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling |
| timesheet-app | `frontend` → `vite@>=7.0.0 <=7.3.1` (direct) | CVE-2026-39363 / GHSA-p9ff-h696-f583 | n/a | Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket |
| timesheet-app | `frontend` → `vite@>=7.0.0 <=7.3.4` (direct) | CVE-2026-53632 / GHSA-v6wh-96g9-6wx3 | n/a | launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows |
| timesheet-app | `frontend` → `vite@>=7.1.0 <=7.3.1` (direct) | CVE-2026-39364 / GHSA-v2wj-q39q-566r | n/a | Vite: `server.fs.deny` bypassed with queries |
| uc-cve-remediation-regulatory-compliance | `icu4j-61.1.jar` | CVE-2020-10531 | 8.8 | An issue was discovered in International Components for Unicode (ICU) for C/C++ through 66.1. An integer overflow, leading to a heap-based b |
| uc-cve-remediation-regulatory-compliance | `spring-security-core-5.6.1.jar` | CVE-2018-1258 | 8.8 | Spring Framework version 5.0.5 when used in combination with any versions of Spring Security contains an authorization bypass when using met |
| uc-cve-remediation-regulatory-compliance | `spring-security-web-5.6.1.jar` | CVE-2018-1258 | 8.8 | Spring Framework version 5.0.5 when used in combination with any versions of Spring Security contains an authorization bypass when using met |
| uc-cve-remediation-regulatory-compliance | `protobuf-java-3.9.0.jar` | CVE-2024-7254 | 8.7 | Any project that parses untrusted Protocol Buffers data containing an arbitrary number of nested groups / series of SGROUP tags can corrupte |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-49124 | 8.4 | Untrusted Search Path vulnerability in Apache Tomcat installer for Windows. During installation, the Tomcat installer for Windows used icacl |
| uc-cve-remediation-regulatory-compliance | `protobuf-java-3.9.0.jar` | CVE-2026-0994 | 8.2 | A denial-of-service (DoS) vulnerability exists in google.protobuf.json_format.ParseDict() in Python, where the max_recursion_depth limit can |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2026-54512 | 8.1 | jackson-databind contains the general-purpose data-binding functionality and tree-model for Jackson Data Processor. From 2.10.0 until 2.18.8 |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2026-54513 | 8.1 | jackson-databind contains the general-purpose data-binding functionality and tree-model for Jackson Data Processor. From 2.10.0 until 2.18.8 |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2024-22259 | 8.1 | Applications that use UriComponentsBuilder in Spring Framework to parse an externally provided URL (e.g. through a query parameter) AND perf |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-65183 | 8.1 | Time-of-check Time-of-use (TOCTOU) Race Condition vulnerability in Apache Tomcat when creating unix domain sockets allows an unauthorised lo |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-66422 | 8.1 | Improper Authorization vulnerability in Apache Tomcat cause by security-role-ref definitions being incorrectly used as role aliases within t |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-68569 | 8.1 | Improper Authentication vulnerability in Apache Tomcat meant that in some circumstances (e.g. CLIENT-CERT, SPNEGO) that a user would be auth |
| uc-cve-remediation-regulatory-compliance | `graphql-java-17.3.jar` | CVE-2022-37734 | 7.5 | graphql-java before19.0 is vulnerable to Denial of Service. An attacker can send a malicious GraphQL query that consumes CPU resources. The  |
| uc-cve-remediation-regulatory-compliance | `graphql-java-17.3.jar` | CVE-2023-28867 | 7.5 | In GraphQL Java (aka graphql-java) before 20.1, an attacker can send a crafted GraphQL query that causes stack consumption. The fixed versio |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2020-36518 | 7.5 | jackson-databind before 2.13.0 allows a Java StackOverflow exception and denial of service via a large depth of nested objects. |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2022-42003 | 7.5 | In FasterXML jackson-databind before versions 2.13.4.1 and 2.12.17.1, resource exhaustion can occur because of a lack of a check in primitiv |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2022-42004 | 7.5 | In FasterXML jackson-databind before 2.13.4, resource exhaustion can occur because of a lack of a check in BeanDeserializer._deserializeFrom |
| uc-cve-remediation-regulatory-compliance | `java-dataloader-3.1.0.jar` | CVE-2022-37734 | 7.5 | graphql-java before19.0 is vulnerable to Denial of Service. An attacker can send a malicious GraphQL query that consumes CPU resources. The  |
| uc-cve-remediation-regulatory-compliance | `java-dataloader-3.1.0.jar` | CVE-2023-28867 | 7.5 | In GraphQL Java (aka graphql-java) before 20.1, an attacker can send a crafted GraphQL query that causes stack consumption. The fixed versio |
| uc-cve-remediation-regulatory-compliance | `json-smart-2.4.7.jar` | CVE-2023-1370 | 7.5 | [Json-smart](https://netplex.github.io/json-smart/) is a performance focused, JSON processor lib. |
| uc-cve-remediation-regulatory-compliance | `logback-core-1.2.10.jar` | CVE-2023-6378 | 7.5 | A serialization vulnerability in logback receiver component part of  |
| uc-cve-remediation-regulatory-compliance | `protobuf-java-3.9.0.jar` | CVE-2022-3171 | 7.5 | A parsing issue with binary data in protobuf-java core and lite versions prior to 3.21.7, 3.20.3, 3.19.6 and 3.16.3 can lead to a denial of  |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-25857 | 7.5 | The package org.yaml:snakeyaml from 0 and before 1.31 are vulnerable to Denial of Service (DoS) due missing to nested depth limitation for c |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2023-20860 | 7.5 | Spring Framework running version 6.0.0 - 6.0.6 or 5.3.0 - 5.3.25 using "**" as a pattern in Spring Security configuration with the mvcReques |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41838 | 7.5 | IDs for WebSocket sessions in the spring-websocket module are not cryptographically unpredictable, which may be possible to exploit in combi |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41842 | 7.5 | Spring MVC and WebFlux applications are vulnerable to Denial of Service (DoS) attacks when resolving static resources. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41848 | 7.5 | Applications may be vulnerable to a Regular Expression Denial of Service (ReDoS) attack if an attacker is able to provide a pattern which is |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41849 | 7.5 | An integer overflow vulnerability exists in the evaluation logic of the Spring Expression Language (SpEL). An attacker can exploit this by s |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41850 | 7.5 | Applications that evaluate user-supplied Spring Expression Language (SpEL) expressions are vulnerable to an Algorithmic Denial of Service (D |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41851 | 7.5 | Applications which accept user-supplied Spring Expression Language (SpEL) expressions may be vulnerable to a Denial of Service (DoS) attack  |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47886 | 7.5 | Applications that evaluate user-supplied Spring Expression Language (SpEL) expressions may be vulnerable to a Denial of Service (DoS) attack |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47888 | 7.5 | A Spring RSocket application is exposed to a memory leak via a malformed SETUP frame. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47893 | 7.5 | A Spring WebFlux application that supports WebSocket connections may expose indirectly sensitive user information by including request heade |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-59282 | 7.5 | Spring Framework applications that use Spring's data binding infrastructure to apply user-supplied property paths onto a target object may b |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2022-29885 | 7.5 | The documentation of Apache Tomcat 10.1.0-M1 to 10.1.0-M14, 10.0.0-M1 to 10.0.20, 9.0.13 to 9.0.62 and 8.5.38 to 8.5.78 for the EncryptInter |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2022-42252 | 7.5 | If Apache Tomcat 8.5.0 to 8.5.82, 9.0.0-M1 to 9.0.67, 10.0.0-M1 to 10.0.26 or 10.1.0-M1 to 10.1.0 was configured to ignore invalid HTTP head |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2022-45143 | 7.5 | The JsonErrorReportValve in Apache Tomcat 8.5.83, 9.0.40 to 9.0.68 and 10.1.0-M1 to 10.1.1 did not escape the type, message or description v |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2023-44487 | 7.5 | The HTTP/2 protocol allows a denial of service (server resource consumption) because request cancellation can reset many streams quickly, as |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2023-46589 | 7.5 | Improper Input Validation vulnerability in Apache Tomcat.Tomcat from 11.0.0-M1 through 11.0.0-M10, from 10.1.0-M1 through 10.1.15, from 9.0. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-24549 | 7.5 | Denial of Service due to improper input validation vulnerability for HTTP/2 requests in Apache Tomcat. When processing an HTTP/2 request, if |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-34750 | 7.5 | Improper Handling of Exceptional Conditions, Uncontrolled Resource Consumption vulnerability in Apache Tomcat. When processing an HTTP/2 str |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-38286 | 7.5 | Allocation of Resources Without Limits or Throttling vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-48988 | 7.5 | Allocation of Resources Without Limits or Throttling vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-48989 | 7.5 | Improper Resource Shutdown or Release vulnerability in Apache Tomcat made Tomcat vulnerable to the made you reset attack. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-49125 | 7.5 | Authentication Bypass Using an Alternate Path or Channel vulnerability in Apache Tomcat.  When using PreResources or PostResources mounted o |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-52434 | 7.5 | Concurrent Execution using Shared Resource with Improper Synchronization ('Race Condition') vulnerability in Apache Tomcat when using the AP |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-52520 | 7.5 | For some unlikely configurations of multipart upload, an Integer Overflow vulnerability in Apache Tomcat could lead to a DoS via bypassing o |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-53506 | 7.5 | Uncontrolled Resource Consumption vulnerability in Apache Tomcat if an HTTP/2 client did not acknowledge the initial settings frame that red |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-55752 | 7.5 | Relative Path Traversal vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-24880 | 7.5 | Inconsistent Interpretation of HTTP Requests ('HTTP Request/Response Smuggling') vulnerability in Apache Tomcat via invalid chunk extension. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-29146 | 7.5 | Padding Oracle vulnerability in Apache Tomcat's EncryptInterceptor with default configuration. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-34483 | 7.5 | Improper Encoding or Escaping of Output vulnerability in the JsonAccessLogValve component of Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-34487 | 7.5 | Insertion of Sensitive Information into Log File vulnerability in the cloud membership for clustering component of Apache Tomcat exposed the |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-41284 | 7.5 | Allocation of Resources Without Limits or Throttling vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-43513 | 7.5 | Improper Handling of Case Sensitivity vulnerability in LockOutRealm in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-65927 | 7.5 | Off-by-one Error vulnerability in Apache Tomcat impacting the [N] flag on the rewrite valves causes rewrite processing to restart at the sec |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-68763 | 7.5 | Uncontrolled Resource Consumption vulnerability in Apache Tomcat via an allocation leak in the HTTP/2 backlog tracking when a stream is rese |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-46701 | 7.3 | Improper Handling of Case Sensitivity vulnerability in Apache Tomcat's GCI servlet allows security constraint bypass of security constraints |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-42498 | 7.3 | Exposure of HTTP Authentication Header to unexpected hosts during WebSocket authentication vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-53404 | 7.3 | Always-Incorrect Control Flow Implementation vulnerability in Apache Tomcat's rewrite valve meant that if the first condition in an OR chain |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-55957 | 7.3 | Missing Critical Step in Authentication vulnerability in Apache Tomcat when the JNDIRealm was configured to authenticate binds using GSSAPI  |
| uc-cve-remediation-regulatory-compliance | `guava-30.0-jre.jar` | CVE-2023-2976 | 7.1 | Use of Java's default temporary directory for file creation in `FileBackedOutputStream` in Google Guava versions 1.0 to 31.1 on Unix systems |
| uc-cve-remediation-regulatory-compliance | `icu4j-61.1.jar` | CVE-2025-5222 | 7.0 | A stack buffer overflow was found in Internationl components for unicode (ICU ). While running the genrb binary, the 'subtag' struct overflo |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2022-23181 | 7.0 | The fix for bug CVE-2020-9484 introduced a time of check, time of use vulnerability into Apache Tomcat 10.1.0-M1 to 10.1.0-M8, 10.0.0-M5 to  |

## MEDIUM (73)

| Repo | Dependency / file | CVE / rule ID | CVSS | Title |
|---|---|---|---|---|
| timesheet-app | `backend` → `joi@<17.13.4` (direct) | CVE-2026-48038 / GHSA-q7cg-457f-vx79 | 5.3 | joi has an uncaught RangeError on deeply nested input through recursive `link()` schemas |
| timesheet-app | `backend` → `morgan@<1.12.0` (direct) | CVE-2026-15603 / GHSA-jxfw-x594-9x9m | 5.3 | morgan vulnerable to Log Forging via unescaped Unicode line separators |
| timesheet-app | `backend` → `morgan@>=1.2.0 <=1.10.1` (direct) | CVE-2026-5078 / GHSA-4vj7-5mj6-jm8m | 5.3 | morgan vulnerable to Log Forging via unneutralized control characters in :remote-user |
| timesheet-app | `backend` → `qs@>=2.2.5 <6.16.0` (transitive) | CVE-2026-82417 / GHSA-4mjr-xmp4-gh2g | 5.3 | qs: Denial of Service via Attacker Controlled isBuffer |
| timesheet-app | `backend` → `qs@>=6.11.1 <=6.15.1` (transitive) | CVE-2026-8723 / GHSA-q8mj-m7cp-5q26 | 5.3 | qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefined entries in comma-format arrays when encodeValuesOnly is set |
| timesheet-app | `frontend` → `yaml@>=1.0.0 <1.10.3` (transitive) | CVE-2026-33532 / GHSA-48c2-rrv3-qjmp | 4.3 | yaml is vulnerable to Stack Overflow via deeply nested YAML collections |
| timesheet-app | `frontend` → `yaml@>=2.0.0 <2.8.3` (transitive) | CVE-2026-33532 / GHSA-48c2-rrv3-qjmp | 4.3 | yaml is vulnerable to Stack Overflow via deeply nested YAML collections |
| timesheet-app | `backend` → `body-parser@<1.20.6` (transitive) | CVE-2026-12590 / GHSA-v422-hmwv-36x6 | 3.7 | body-parser vulnerable to denial of service when invalid limit value silently disables size enforcement |
| timesheet-app | `backend` → `joi@>=16.0.0 <17.13.5` (direct) | CVE-2026-84367 / GHSA-gg4h-3hg2-grpc | 3.7 | joi: object().rename() with a template target can set the validated object's prototype |
| timesheet-app | `backend` → `joi@>=17.2.0 <17.13.6` (direct) | CVE-2026-84368 / GHSA-6w3j-5fw6-r9vr | 3.7 | joi: Prototype pollution via a `__proto__` language key in custom messages |
| timesheet-app | `backend` → `qs@<6.14.1` (transitive) | CVE-2025-15284 / GHSA-6rw7-vpxm-498p | 3.7 | qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion |
| timesheet-app | `backend` → `qs@>=6.7.0 <=6.14.1` (transitive) | CVE-2026-2391 / GHSA-w7fw-mjwx-w883 | 3.7 | qs's arrayLimit bypass in comma parsing allows denial of service |
| timesheet-app | `backend` → `baseline-browser-mapping@>=2.0.0 <2.11.0` (transitive) | CVE-2026-45819 / GHSA-w5vr-8v7q-w6rv | n/a | baseline-browser-mapping process termination on invalid input causes denial of service |
| timesheet-app | `frontend` → `@humanfs/node@<0.16.8` (transitive) | GHSA-p498-v437-472g | n/a | humanfs: Recursive copy follows symlinked files and copies data from outside the source tree |
| timesheet-app | `frontend` → `ajv@<6.14.0` (transitive) | CVE-2025-69873 / GHSA-2g4f-4pwh-qvx6 | n/a | ajv has ReDoS when using `$data` option |
| timesheet-app | `frontend` → `baseline-browser-mapping@>=2.0.0 <2.11.0` (transitive) | CVE-2026-45819 / GHSA-w5vr-8v7q-w6rv | n/a | baseline-browser-mapping process termination on invalid input causes denial of service |
| timesheet-app | `frontend` → `follow-redirects@<=1.15.11` (transitive) | GHSA-r4q5-vmmm-2653 | n/a | follow-redirects leaks Custom Authentication Headers to Cross-Domain Redirect Targets |
| uc-cve-remediation-regulatory-compliance | `log4j-api-2.17.1.jar` | CVE-2026-34479 | 6.9 | The Log4j1XmlLayout from the Apache Log4j 1-to-Log4j 2 bridge fails to escape characters forbidden by the XML 1.0 standard, producing malfor |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-73180 | 6.8 | Insufficient Session Expiration vulnerability in Apache Tomcat meant that if the session ID for an authenticated HTTP session was changed af |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-38749 | 6.5 | Using snakeYAML to parse untrusted YAML files may be vulnerable to Denial of Service attacks (DOS). If the parser is running on user supplie |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-38751 | 6.5 | Using snakeYAML to parse untrusted YAML files may be vulnerable to Denial of Service attacks (DOS). If the parser is running on user supplie |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-38752 | 6.5 | Using snakeYAML to parse untrusted YAML files may be vulnerable to Denial of Service attacks (DOS). If the parser is running on user supplie |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-41854 | 6.5 | Those using Snakeyaml to parse untrusted YAML files may be vulnerable to Denial of Service attacks (DOS). If the parser is running on user s |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2022-22950 | 6.5 | n Spring Framework versions 5.3.0 - 5.3.16 and older unsupported versions, it is possible for a user to provide a specially crafted SpEL exp |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2022-22971 | 6.5 | In spring framework versions prior to 5.3.20+ , 5.2.22+ and old unsupported versions, application with a STOMP over WebSocket endpoint is vu |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2023-20861 | 6.5 | In Spring Framework versions 6.0.0 - 6.0.6, 5.3.0 - 5.3.25, 5.2.0.RELEASE - 5.2.22.RELEASE, and older unsupported versions, it is possible f |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2023-20863 | 6.5 | In spring framework versions prior to 5.2.24 release+ ,5.3.27+ and 6.0.8+ , it is possible for a user to provide a specially crafted SpEL ex |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-22740 | 6.5 | A WebFlux server application that processes multipart requests creates temp files for parts larger than 10 K. Under some circumstances, temp |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-55668 | 6.5 | Session Fixation vulnerability in Apache Tomcat via rewrite valve. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-55955 | 6.5 | Improper Authentication vulnerability in Apache Tomcat allowed a replay attack against the EncryptionInterceptor in the cluster component. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-55956 | 6.5 | Improper Authorization vulnerability in Apache Tomcat leads to security constraints specified for the default servlet ignoring any method or |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2026-50193 | 6.3 | jackson-databind contains the general-purpose data-binding functionality and tree-model for Jackson Data Processor. From 2.13.0 until 2.14.0 |
| uc-cve-remediation-regulatory-compliance | `log4j-api-2.17.1.jar` | CVE-2026-34477 | 6.3 | The fix for  CVE-2025-68161 https://logging.apache.org/security.html#CVE-2025-68161  was incomplete: it addressed hostname verification only |
| uc-cve-remediation-regulatory-compliance | `log4j-api-2.17.1.jar` | CVE-2026-49844 | 6.3 | Improper encoding of non-finite floating-point values during MapMessage JSON serialization in Apache Log4j API produces output that is not v |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-23672 | 6.3 | Denial of Service via incomplete cleanup vulnerability in Apache Tomcat. It was possible for WebSocket clients to keep WebSocket connections |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41844 | 6.1 | A Spring MVC or Spring WebFlux application which configures a mapping for "/**" where the view name is not explicitly specified allows an at |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41845 | 6.1 | Due to incorrect escaping, the use of JavaScriptUtils.javaScriptEscape() may lead to JavaScript code injection in the browser, potentially r |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41846 | 6.1 | Spring MVC applications which accept user-supplied values in the cssClass, cssErrorClass, or cssStyle attributes of JSP form tags allow arbi |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-47887 | 6.1 | A Spring MVC application that uses UrlFileNameViewController that is mapped with an end-of-path, and does not have a configured prefix is vu |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-59281 | 6.1 | Spring MVC and WebFlux applications that obtain a data-binding Errors instance with HTML escaping enabled and then render field errors using |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2022-34305 | 6.1 | In Apache Tomcat 10.1.0-M1 to 10.1.0-M16, 10.0.0-M1 to 10.0.22, 9.0.30 to 9.0.64 and 8.5.50 to 8.5.81 the Form authentication example in the |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2023-41080 | 6.1 | URL Redirection to Untrusted Site ('Open Redirect') vulnerability in FORM authentication feature Apache Tomcat.This issue affects Apache Tom |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-25854 | 6.1 | Occasional URL redirection to untrusted Site ('Open Redirect') vulnerability in Apache Tomcat via the LoadBalancerDrainingValve. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-50229 | 6.1 | Improper Neutralization of Script-Related HTML Tags in a Web Page (Basic XSS) vulnerability in the number guess example for Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-22737 | 5.9 | Use of Java scripting engine enabled (e.g. JRuby, Jython) template views in Spring MVC and Spring WebFlux applications can result in disclos |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41840 | 5.9 | Spring WebFlux applications are vulnerable to Denial of Service (DoS) attacks when processing multipart requests. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41841 | 5.9 | Spring MVC and WebFlux applications are vulnerable to Information Disclosure attacks when resolving static resources. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41843 | 5.9 | Spring MVC and WebFlux applications are vulnerable to Path Traversal attacks when resolving static resources. |
| uc-cve-remediation-regulatory-compliance | `icu4j-61.1.jar` | CVE-2020-21913 | 5.5 | International Components for Unicode (ICU-20850) v66.1 was discovered to contain a use after free bug in the pkg_createWithAssemblyCode func |
| uc-cve-remediation-regulatory-compliance | `protobuf-java-3.9.0.jar` | CVE-2021-22569 | 5.5 | An issue in protobuf-java allowed the interleaving of com.google.protobuf.UnknownFieldSet fields in such a way that would be processed out o |
| uc-cve-remediation-regulatory-compliance | `protobuf-java-3.9.0.jar` | CVE-2021-22570 | 5.5 | Nullptr dereference when a null char is present in a proto symbol. The symbol is parsed incorrectly, leading to an unchecked call into the p |
| uc-cve-remediation-regulatory-compliance | `snakeyaml-1.29.jar` | CVE-2022-38750 | 5.5 | Using snakeYAML to parse untrusted YAML files may be vulnerable to Denial of Service attacks (DOS). If the parser is running on user supplie |
| uc-cve-remediation-regulatory-compliance | `commons-lang3-3.12.0.jar` | CVE-2025-48924 | 5.3 | Uncontrolled Recursion vulnerability in Apache Commons Lang. |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2026-54514 | 5.3 | jackson-databind contains the general-purpose data-binding functionality and tree-model for Jackson Data Processor. From 2.0.0 until 2.18.8, |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2026-54515 | 5.3 | jackson-databind contains the general-purpose data-binding functionality and tree-model for Jackson Data Processor. From 2.8.0 until 2.18.9, |
| uc-cve-remediation-regulatory-compliance | `kotlin-stdlib-1.6.10.jar` | CVE-2020-29582 | 5.3 | In JetBrains Kotlin before 1.4.21, a vulnerable Java API was used for temporary file and folder creation. An attacker was able to read data  |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2022-22968 | 5.3 | In Spring Framework versions 5.3.0 - 5.3.18, 5.2.0 - 5.2.20, and older unsupported versions, the patterns for disallowedFields on a DataBind |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2022-22970 | 5.3 | In spring framework versions prior to 5.3.20+ , 5.2.22+ and old unsupported versions, applications that handle file uploads are vulnerable t |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2024-38820 | 5.3 | The fix for CVE-2022-22968 made disallowedFields patterns in DataBinder case insensitive. However, String.toLowerCase() has some Locale depe |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-22745 | 5.3 | Spring MVC and WebFlux applications are vulnerable to Denial of Service attacks when resolving static resources. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41847 | 5.3 | Spring WebFlux applications may be vulnerable to a security bypass when using the Kotlin Router DSL. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41852 | 5.3 | A vulnerability in Spring Expression Language (SpEL) evaluation logic allows for arbitrary zero-argument method invocation, even within rest |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41853 | 5.3 | Spring MVC and WebFlux applications are vulnerable to Multipart request smuggling attacks. |
| uc-cve-remediation-regulatory-compliance | `spring-hateoas-1.4.1.jar` | CVE-2023-34036 | 5.3 |  |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2023-42795 | 5.3 | Incomplete Cleanup vulnerability in Apache Tomcat.When recycling various internal objects in Apache Tomcat from 11.0.0-M1 through 11.0.0-M11 |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2023-45648 | 5.3 | Improper Input Validation vulnerability in Apache Tomcat.Tomcat from 11.0.0-M1 through 11.0.0-M11, from 10.1.0-M1 through 10.1.13, from 9.0. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2024-54677 | 5.3 | Uncontrolled Resource Consumption vulnerability in the examples web application provided with Apache Tomcat leads to denial of service. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2025-61795 | 5.3 | Improper Resource Shutdown or Release vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `jackson-databind-2.13.1.jar` | CVE-2023-35116 | 4.7 | jackson-databind through 2.15.2 allows attackers to cause a denial of service or other unspecified impact via a crafted object that uses cyc |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2024-38808 | 4.3 | In Spring Framework versions 5.3.0 - 5.3.38 and older unsupported versions, it is possible for a user to provide a specially crafted Spring  |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-59280 | 4.3 | Applications using Spring Framework's FreeMarker integration may be vulnerable to a path traversal attack when a controller returns a view n |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2023-28708 | 4.3 | When using the RemoteIpFilter with requests received from a    reverse proxy via HTTP that include the X-Forwarded-Proto    header set to ht |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-41839 | 4.2 | A WebFlux application with a compromised subdomain (for example, compromised via cross-site scripting (XSS)) is vulnerable to an escalation  |

## LOW (10)

| Repo | Dependency / file | CVE / rule ID | CVSS | Title |
|---|---|---|---|---|
| timesheet-app | `backend` → `@tootallnate/once@<2.0.1` (transitive) | CVE-2026-3449 / GHSA-vpq2-c234-7xj6 | 3.3 | @tootallnate/once vulnerable to Incorrect Control Flow Scoping |
| timesheet-app | `backend` → `@babel/core@<=7.29.0` (transitive) | CVE-2026-49356 / GHSA-4x5r-pxfx-6jf8 | 3.2 | @babel/core: Arbitrary File Read via sourceMappingURL Comment |
| timesheet-app | `frontend` → `@babel/core@<=7.29.0` (transitive) | CVE-2026-49356 / GHSA-4x5r-pxfx-6jf8 | 3.2 | @babel/core: Arbitrary File Read via sourceMappingURL Comment |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-59314 | 3.7 | Applications that build a Content-Disposition header value from untrusted input may be vulnerable to HTTP response splitting when the input  |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2021-43980 | 3.7 | The simplified implementation of blocking reads and writes introduced in Tomcat 10 and back-ported to Tomcat 9.0.47 onwards exposed a long s |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-24733 | 3.7 | Improper Input Validation vulnerability in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `tomcat-embed-core-9.0.56.jar` | CVE-2026-43514 | 3.7 | Observable Timing Discrepancy vulnerability when comparing AJP secret in Apache Tomcat. |
| uc-cve-remediation-regulatory-compliance | `guava-30.0-jre.jar` | CVE-2020-8908 | 3.3 | A temp directory creation vulnerability exists in all versions of Guava, allowing an attacker with access to the machine to potentially acce |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-22741 | 3.1 | Spring MVC and WebFlux applications are vulnerable to cache poisoning when resolving static resources. |
| uc-cve-remediation-regulatory-compliance | `spring-core-5.3.15.jar` | CVE-2026-22735 | 2.6 | Spring MVC and WebFlux applications are vulnerable to stream corruption when using Server-Sent Events (SSE). This issue affects Spring Found |

## Remediation status

- **timesheet-app**: all CRITICAL/HIGH (and, as a side effect, all MEDIUM/LOW) npm advisories remediated — see
  `REMEDIATION_REPORT.md` in the timesheet-app PR. Post-fix `npm audit` reports 0 vulnerabilities in both
  `backend/` and `frontend/`.
- **uc-cve-remediation-regulatory-compliance**: not remediated in this pass (out of scope); findings above are the
  backlog. Recommended first steps: upgrade Spring Boot 2.6.3 → 2.7.x/3.x line, bump `org.owasp.dependencycheck`
  plugin to ≥ 12.x and Gradle wrapper to 8.x so `./gradlew dependencyCheckAnalyze` works again.
