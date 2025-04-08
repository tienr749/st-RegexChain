# RegexChain Extension for SillyTavern

SillyTavern 사용자를 위한 Regex 스크립트 관리 자동화 및 간소화 확장 프로그램입니다. 프로필 변경 또는 Quick Reply(QR) 실행과 같은 작업과 연계하여 특정 Regex 스크립트를 효율적으로 활성화/비활성화할 수 있습니다.

/regex-toggle 명령어가 추가된 **1.12.13 버전 이후**에서만 사용 가능합니다.

**핵심 기능:**

*   **선택적 활성화:** 필요한 Regex 스크립트만 켜고, 지정되지 않은 다른 활성&비보호 스크립트는 끕니다.
*   **상태 기반 최적화:** 이미 원하는 상태(ON/OFF)인 스크립트에 대해 불필요한 명령을 실행하지 않습니다.
*   **보호 기능:** 특정 스크립트가 자동으로 꺼지지 않도록 보호 목록을 설정할 수 있습니다.

## 슬래시 명령어 사용 안내

RegexChain 확장은 다음과 같은 슬래시 명령어를 제공합니다:

---

### `/RegexChain`

주요 작업(연결프로필)과 Regex 스크립트 설정을 하나의 명령어로 연결합니다.

**주요 기능:**

*   프로필 또는 모델을 로드하는 동시에 관련 Regex 스크립트를 설정합니다.
*   지정된 스크립트는 켜고(OFF->ON) 다른 활성&비보호 스크립트는 끕니다(ON->OFF).

**사용법:**

*   `/RegexChain profile="프로필명" regex="스크립트1, 스크립트2"`
    *   **설명:** 지정된 `프로필명`을 로드한 후, `스크립트1`, `스크립트2`를 활성화(OFF->ON)하고, 나머지 활성&비보호 스크립트를 비활성화(ON->OFF)합니다.
    *   **예시:** `/RegexChain profile="창작 도우미" regex="아이디어 확장, 문체 변환"`
    *   **regex:** `regex에 등록할 정규식은 comma(,)로 구분되며 1~n개의 등록이 가능합니다. (이하 모든 슬래시 명령어에 공통)

**인자:**

*   `profile` : 로드할 프로필 이름.
*   `regex`: on으로 설정할 Regex 스크립트 이름 목록 (쉼표 구분). 생략 시 Regex 상태 변경 없음. `""`(빈 문자열) 입력 시 활성&비보호 스크립트 비활성화 시도.

**참고:** 이 명령어는 `regex` 인자가 주어지고 비어있지 않을 때, **항상** 지정되지 않은 다른 활성&비보호 스크립트를 끄려고 시도합니다. 보호된 스크립트는 꺼지지 않습니다.

---

### `/RegexChainQR`

Quick Reply(QR)를 실행한 후, 지정된 Regex 스크립트만 활성화합니다.

**주요 기능:**

*   QR 실행과 특정 Regex 스크립트 활성화를 연결합니다.
*   **중요:** 이 명령어는 지정된 스크립트를 켜기만 할 뿐(OFF->ON), **다른 스크립트를 끄지 않습니다.**

**사용법:**

*   `/RegexChainQR qr="QR 이름" regex="스크립트1, 스크립트2"`
    *   **설명:** 지정된 `QR 이름`의 Quick Reply를 실행합니다. 성공하면, `스크립트1`과 `스크립트2`가 현재 OFF 상태일 경우 활성화(ON)합니다. 다른 스크립트의 상태는 변경하지 않습니다.
    *   **예시:** `/RegexChainQR qr="자동번역OFF" regex="원문 보기"`
*   `/RegexChainQR qr="Set이름.QR라벨" regex="스크립트1"`
    *   **설명:** 특정 Set에 포함된 QR도 `Set이름.QR라벨` 형식으로 지정하여 실행할 수 있습니다. 실행 후 `스크립트1`을 활성화(OFF->ON)합니다.
    *   **예시:** `/RegexChainQR qr="MyQRs.번역 활성화" regex="번역 스크립트"`

**인자:**

*   `qr` (필수): 실행할 Quick Reply의 이름 (또는 `Set이름.QR라벨`).
*   `regex` (필수): 활성화할 Regex 스크립트 이름 목록 (쉼표 구분, 최소 1개 이상).

**참고:** 이 명령어는 다른 스크립트의 상태에 영향을 주지 않으므로, 특정 작업 후 필요한 스크립트만 '추가'하는 데 유용합니다. 보호 설정은 이 명령어의 동작에 영향을 미치지 않습니다.

---
(이 명령은 필요에 따라 사용하세요)

### `/RegexSet`

Regex 스크립트의 활성화(ON)/비활성화(OFF) 상태를 직접 제어합니다.

**주요 기능:**

*   지정한 스크립트만 활성화하고, 현재 활성화된 다른 비보호 스크립트는 비활성화합니다.
*   모든 스크립트를 켜거나 끌 수 있습니다.
*   현재 사용 가능한 스크립트 목록과 상태를 확인합니다.

**사용법:**

*   `/RegexSet`
    *   **설명:** 현재 로드된 모든 Regex 스크립트 목록과 각각의 활성화(ON)/비활성화(OFF) 상태를 표시합니다.
*   `/RegexSet regex="스크립트1, 스크립트2"`
    *   **설명:** `스크립트1`과 `스크립트2`를 활성화합니다 (단, 현재 OFF 상태인 경우에만). 동시에, 이 두 스크립트를 제외하고 현재 ON 상태인 다른 **비보호** 스크립트들은 비활성화합니다 (현재 ON 상태인 경우에만).
    *   **예시:** `/RegexSet regex="생각 접기, 요약 모드"`
*   `/RegexSet regex=_all_on_`
    *   **설명:** 현재 OFF 상태인 모든 Regex 스크립트를 활성화합니다. 이미 ON 상태인 스크립트는 건드리지 않습니다. (보호 설정과 관계없이 모든 OFF 상태 스크립트가 대상입니다.)
*   `/RegexSet regex=_all_off_`
    *   **설명:** 현재 ON 상태인 모든 **비보호** Regex 스크립트를 비활성화합니다. 이미 OFF 상태이거나 보호된 스크립트는 건드리지 않습니다.
*   `/RegexSet regex=_all_off_ force=true`
    *   **설명:** 현재 ON 상태인 **모든** Regex 스크립트를 강제로 비활성화합니다. **보호 설정을 무시합니다.**

**인자:**

*   `regex` (선택): 쉼표로 구분된 Regex 스크립트 이름 목록, 특수 키워드(`_all_on_`, `_all_off_`). 비워두면 목록/상태 표시.
*   `force` (선택, 기본값: `false`): `_all_off_` 사용 시 `true`로 설정하면 보호된 스크립트도 강제로 비활성화합니다.

**참고:** 스크립트 이름에 공백이 포함된 경우 따옴표로 감싸야 합니다. 예: `/RegexSet regex="My Script, Another One"`

---

## 보호된 Regex 스크립트 설정

확장 기능 설정 메뉴 (`확장 기능` 탭 > `RegexChain`)에서 **"보호된 Regex 스크립트"** 목록을 관리할 수 있습니다.

*   **텍스트 영역:** 쉼표로 구분하여 보호할 스크립트 이름을 직접 입력하거나 편집할 수 있습니다.
*   **'+' 버튼:** 클릭하면 현재 보호 목록에 없는 스크립트 목록이 나타나며, 클릭하여 보호 목록에 추가할 수 있습니다.
*   **'-' 버튼:** 클릭하면 현재 보호 목록에 있는 스크립트 목록이 나타나며, 클릭하여 보호 목록에서 제거할 수 있습니다.

여기에 등록된 스크립트는 `/RegexSet` (force=false 사용 시) 또는 `/RegexChain` 명령어가 다른 스크립트를 자동으로 비활성화할 때 **제외**됩니다. 즉, 항상 켜진 상태를 유지해야 하는 유틸리티성 스크립트 등을 보호하는 데 사용됩니다. (`_all_off_ force=true` 사용 시에는 보호되지 않습니다.)

---
