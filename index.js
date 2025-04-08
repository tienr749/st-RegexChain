// --- START OF FILE index.js (v1.3단계o 기반 + RegexChainQR 분리 및 ON 명령어 최적화) ---

// 필요한 SillyTavern 모듈 임포트
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandEnumValue, enumTypes } from '../../../slash-commands/SlashCommandEnumValue.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';

// 확장 프로그램 정보 정의
const extensionName = "st-RegexChain";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// === 설정 관리 ===
const defaultSettings = {
    protectedScriptsString: "",
};
extension_settings[extensionName] = { ...defaultSettings, ...(extension_settings[extensionName] || {}) };

// === 상수 정의 ===
const KEYWORD_ALL_ON = "_all_on_"; // /regexSet 에서만 사용
const KEYWORD_ALL_OFF = "_all_off_"; // /regexSet 에서만 사용

// === 디버깅이 추가된 헬퍼 함수들 (변경 없음) ===

function getAllRegexScriptNamesFromUI() {
    try {
        const elements = document.querySelectorAll('#saved_regex_scripts .regex_script_name, #saved_scoped_scripts .regex_script_name');
        if (!elements || elements.length === 0) {
            return [];
        }
        return Array.from(elements).map(el => el.textContent.trim()).filter(name => name !== '');
    } catch (error) {
        console.error(`[${extensionName}] Error getting script names from UI:`, error);
        return [];
    }
}

/**
 * NEW: 현재 UI에서 활성화(ON) 상태인 Regex 스크립트 이름 목록을 가져옵니다. (DEBUGGING VERSION - FIX 1)
 */
function getCurrentlyEnabledRegexScriptNames() {
    const enabledScripts = [];
    //console.log(`[${extensionName} DEBUG] Starting getCurrentlyEnabledRegexScriptNames...`);
    try {
        const scriptLabels = document.querySelectorAll('#saved_regex_scripts .regex-script-label, #saved_scoped_scripts .regex-script-label');
        //console.log(`[${extensionName} DEBUG] Found ${scriptLabels.length} total script labels.`);

        scriptLabels.forEach((labelElement, index) => {
            const nameElement = labelElement.querySelector('.regex_script_name');
            const toggleOnElement = labelElement.querySelector('.regex-toggle-on'); // 활성화 상태 아이콘 '.fa-toggle-on'
            const scriptName = nameElement ? nameElement.textContent.trim() : 'NAME_NOT_FOUND';

            //console.log(`[${extensionName} DEBUG] Checking label ${index + 1}: Name = "${scriptName}"`);

            if (nameElement && toggleOnElement) {
                // --- 가시성 확인 (수정됨: getComputedStyle 우선) ---
                let isVisible = false; // 기본값 false
                let computedDisplayStyle = 'unknown'; // computed style 저장 변수

                try {
                    computedDisplayStyle = window.getComputedStyle(toggleOnElement).display;
                    isVisible = computedDisplayStyle !== 'none'; // 'none'이 아니면 보이는 것으로 간주
                    //console.log(`[${extensionName} DEBUG]   - computed display style: "${computedDisplayStyle}". isVisible determined by computedStyle: ${isVisible}`);
                } catch (e) {
                    console.error(`[${extensionName} DEBUG]   - Error getting computed style for "${scriptName}", assuming not visible:`, e);
                    isVisible = false; // 오류 발생 시 안전하게 false 처리
                }

                // (참고용) offsetParent 결과 로깅 (이제 판단 기준은 아님)
                const isVisibleViaOffsetParent = toggleOnElement.offsetParent !== null;
                if (isVisible !== isVisibleViaOffsetParent) {
                     console.warn(`[${extensionName} DEBUG]   - Visibility check mismatch for "${scriptName}"! computedStyle resulted in ${isVisible}, offsetParent resulted in ${isVisibleViaOffsetParent}. Using computedStyle result.`);
                }
                // --- 가시성 확인 끝 ---

                if (scriptName && scriptName !== 'NAME_NOT_FOUND' && isVisible) {
                    enabledScripts.push(scriptName);
                    //console.log(`[${extensionName} DEBUG]   -> Added "${scriptName}" to enabled list because computed style was not 'none'.`); // 추가 이유 명확화
                } else {
                    //console.log(`[${extensionName} DEBUG]   -> Not added (isVisible based on computed style was ${isVisible}).`);
                }
            } else {
                 //console.log(`[${extensionName} DEBUG]   - Skipping label ${index + 1} for "${scriptName}": Missing nameElement or toggleOnElement.`);
            }
        });
    } catch (error) {
        console.error(`[${extensionName} DEBUG] Error during getCurrentlyEnabledRegexScriptNames:`, error);
    }
    //console.log(`[${extensionName} DEBUG] Finished getCurrentlyEnabledRegexScriptNames. Resulting enabledScripts:`, enabledScripts);
    return enabledScripts;
}


function generateOptionalCommand(name, commandType = 'profile') {
    if (name && typeof name === 'string' && name.trim() !== '') {
        const trimmedName = name.trim();
        const command = `/${commandType.trim()} ${trimmedName}`;
        return command;
    } else {
        return "";
    }
}

/**
 * MODIFIED + DEBUGGING: Parses comma-separated regex names. (변경 없음)
 */
function parseRegexNames(regexString) {
    //console.log(`[${extensionName} DEBUG - parseRegexNames] Received input: "${regexString}"`); // 함수 입력 로그

    // 1. 입력값 유효성 검사
    if (!regexString || typeof regexString !== 'string' || regexString.trim() === '') {
        console.log(`[${extensionName} DEBUG - parseRegexNames] Input is empty or invalid, returning empty array.`);
        return [];
    }

    // 2. 쉼표로 분할
    const parts = regexString.split(',');
    //console.log(`[${extensionName} DEBUG - parseRegexNames] Split by comma:`, JSON.stringify(parts));

    // 3. 각 부분 trim 및 빈 문자열 필터링
    const names = parts
        .map(name => {
            const trimmedName = name.trim(); // 앞뒤 공백 제거
            //console.log(`[${extensionName} DEBUG - parseRegexNames]   Processing part "${name}" -> trimmed to "${trimmedName}"`);
            return trimmedName;
        })
        .filter(name => {
            const isValid = name !== ''; // 빈 문자열이 아닌지 확인
            if (!isValid) {
                //console.log(`[${extensionName} DEBUG - parseRegexNames]     -> Filtering out empty string.`);
            }
            return isValid;
        });

    //console.log(`[${extensionName} DEBUG - parseRegexNames] Finished parsing. Result:`, JSON.stringify(names)); // 최종 결과 로그
    return names;
}

function getProtectedRegexScripts() {
    return parseRegexNames(extension_settings[extensionName]?.protectedScriptsString || "");
}


// === 헬퍼 함수 수정: generateRegexToggleCommands ===
/**
 * MODIFIED: Regex 토글 명령어를 생성합니다.
 * - ON 명령어: 지정된 스크립트 중 현재 OFF 상태인 것만 생성합니다.
 * - OFF 명령어: turnOthersOff=true 일 때만 생성하며, 현재 ON 상태인 비보호 스크립트 중 활성화 대상이 아닌 것만 생성합니다.
 *
 * @param {string[]} targetScriptNamesToEnable 활성화하려는 스크립트 이름 배열
 * @param {boolean} turnOthersOff true이면 활성화 대상이 아닌 다른 활성&비보호 스크립트를 끄는 명령어를 생성 (기본값 true)
 * @returns {string} 생성된 명령어 문자열 (파이프로 연결됨)
 */
function generateRegexToggleCommands(targetScriptNamesToEnable = [], turnOthersOff = true) {
    //console.log(`[${extensionName} DEBUG] Starting generateRegexToggleCommands... (turnOthersOff=${turnOthersOff})`);
    try {
        const allScriptNames = getAllRegexScriptNamesFromUI();
        const protectedScripts = getProtectedRegexScripts();
        const currentlyEnabledScripts = getCurrentlyEnabledRegexScriptNames(); // 함수 내부에서 최신 상태 가져옴
        const commandParts = [];

        // 함수 실행에 사용된 입력 값들 로깅
		/*
        console.log(`[${extensionName} DEBUG]   Inputs for generateRegexToggleCommands:`);
        console.log(`[${extensionName} DEBUG]     allScriptNames:`, JSON.stringify(allScriptNames));
        console.log(`[${extensionName} DEBUG]     protectedScripts:`, JSON.stringify(protectedScripts));
        console.log(`[${extensionName} DEBUG]     currentlyEnabledScripts:`, JSON.stringify(currentlyEnabledScripts));
        console.log(`[${extensionName} DEBUG]     targetScriptNamesToEnable:`, JSON.stringify(targetScriptNamesToEnable));
		*/

        // 1. 비활성화(OFF) 대상 선정 (turnOthersOff 플래그 및 최적화 적용)
        if (turnOthersOff) {
            //console.log(`[${extensionName} DEBUG]   Processing scripts to determine OFF commands (turnOthersOff is true):`);
            allScriptNames.forEach(scriptName => {
                //console.log(`[${extensionName} DEBUG]     Checking script for OFF: "${scriptName}"`);
                const isProtected = protectedScripts.includes(scriptName);
                const isTargetedForEnable = targetScriptNamesToEnable.includes(scriptName);
                const isCurrentlyEnabled = currentlyEnabledScripts.includes(scriptName);

                //console.log(`[${extensionName} DEBUG]       - isProtected: ${isProtected}`);
                //console.log(`[${extensionName} DEBUG]       - isTargetedForEnable: ${isTargetedForEnable}`);
                //console.log(`[${extensionName} DEBUG]       - isCurrentlyEnabled: ${isCurrentlyEnabled}`);

                // 조건: 보호되지 않았고, 활성화 대상이 아니며, 현재 활성화(ON) 상태일 때만 OFF 명령 생성
                if (!isProtected && !isTargetedForEnable && isCurrentlyEnabled) {
                    commandParts.push(`/regex-toggle state=off "${scriptName}"`);
                    //console.log(`[${extensionName} DEBUG]       -> Generating OFF command for "${scriptName}".`);
                } else {
                    //console.log(`[${extensionName} DEBUG]       -> Not generating OFF command for "${scriptName}".`);
                }
            });
        } else {
            //console.log(`[${extensionName} DEBUG]   Skipping OFF command generation (turnOthersOff is false).`);
        }

        // 2. 활성화(ON) 대상 선정 (최적화 적용: 현재 OFF 상태인 것만)
        //console.log(`[${extensionName} DEBUG]   Processing scripts for ON commands (optimizing for currently OFF):`);
        targetScriptNamesToEnable.forEach(targetName => {
             if (targetName && typeof targetName === 'string') {
                const trimmedName = targetName.trim();
                if (trimmedName !== '') {
                    const isCurrentlyEnabled = currentlyEnabledScripts.includes(trimmedName);
                    //console.log(`[${extensionName} DEBUG]     Checking script for ON: "${trimmedName}". Currently enabled: ${isCurrentlyEnabled}`);
                    if (!isCurrentlyEnabled) { // 현재 활성화(ON) 상태가 아닐 때만 ON 명령어 생성
                        commandParts.push(`/regex-toggle state=on "${trimmedName}"`);
                        //console.log(`[${extensionName} DEBUG]       -> Generating ON command for "${trimmedName}" (because it's currently OFF).`);
                    } else {
                        //console.log(`[${extensionName} DEBUG]       -> Skipping ON command for "${trimmedName}" (already ON).`);
                    }
                }
            }
        });

        const finalCommand = commandParts.join(' | ');
        //console.log(`[${extensionName} DEBUG] Finished generateRegexToggleCommands. Final Generated Command: "${finalCommand}"`);
        return finalCommand;

    } catch (error) {
        console.error(`[${extensionName} DEBUG] Error during generateRegexToggleCommands:`, error);
        return "";
    }
}


/**
 * MODIFIED: /regexSet 에서 사용되는 'all off' 명령어 생성 함수. (DEBUGGING VERSION)
 * 현재 활성화된 스크립트만 대상으로 OFF 명령어를 생성하도록 최적화. (변경 없음)
 */
function generateAllOffCommandString(respectProtection = true) {
    //console.log(`[${extensionName} DEBUG] Starting generateAllOffCommandString (respectProtection=${respectProtection})...`); // 함수 시작 로그
    try {
        const currentlyEnabledScripts = getCurrentlyEnabledRegexScriptNames(); // 디버깅 버전 호출
        //console.log(`[${extensionName} DEBUG]   Input currentlyEnabledScripts:`, JSON.stringify(currentlyEnabledScripts)); // 입력값 로깅

        if (currentlyEnabledScripts.length === 0) {
             //console.log(`[${extensionName} DEBUG]   No currently enabled scripts found. Returning empty string.`); // 끌 스크립트 없음 로그
             return "";
        }

        const protectedScripts = respectProtection ? getProtectedRegexScripts() : [];
        //console.log(`[${extensionName} DEBUG]   Protected scripts:`, JSON.stringify(protectedScripts)); // 보호 목록 로깅

        // 보호 설정을 고려하여 실제로 끌 스크립트 필터링
        const scriptsToTurnOff = currentlyEnabledScripts
            .filter(name => {
                const isProtected = protectedScripts.includes(name);
                // 필터링 과정 로그
                //console.log(`[${extensionName} DEBUG]     Filtering "${name}" for turning off: isProtected=${isProtected}. Will be turned off: ${!isProtected}`);
                return !isProtected; // 보호되지 않은 것만 true 반환
            });
        //console.log(`[${extensionName} DEBUG]   Scripts identified to turn OFF (after protection filter):`, JSON.stringify(scriptsToTurnOff)); // 최종으로 끌 스크립트 목록 로깅

        const commandParts = scriptsToTurnOff.map(name => `/regex-toggle state=off "${name}"`);
        const finalCommand = commandParts.join(' | ');
        //console.log(`[${extensionName} DEBUG] Finished generateAllOffCommandString. Final Generated Command: "${finalCommand}"`); // 최종 생성된 명령어 로그
        return finalCommand; // 명령어 문자열 반환

    } catch (error) {
        console.error(`[${extensionName} DEBUG] Error during generateAllOffCommandString:`, error); // 함수 내 오류 발생 로그
        return "";
    }
}

// === 헬퍼 함수 수정: generateAllOnCommandString ===
/**
 * MODIFIED: /regexSet 에서 사용되는 'all on' 명령어 생성 함수.
 * 최적화: 현재 OFF 상태인 스크립트에 대해서만 ON 명령어를 생성합니다.
 */
function generateAllOnCommandString() {
    //console.log(`[${extensionName} DEBUG] Starting generateAllOnCommandString (Optimized)...`);
    try {
        const allScriptNames = getAllRegexScriptNamesFromUI();
        if (allScriptNames.length === 0) {
            //console.log(`[${extensionName} DEBUG]   No scripts found in UI. Returning empty string.`);
            return "";
        }
        const currentlyEnabledScripts = getCurrentlyEnabledRegexScriptNames();
        //console.log(`[${extensionName} DEBUG]   All script names from UI:`, JSON.stringify(allScriptNames));
        //console.log(`[${extensionName} DEBUG]   Currently enabled scripts:`, JSON.stringify(currentlyEnabledScripts));

        const scriptsToTurnOn = allScriptNames.filter(name => {
            const isEnabled = currentlyEnabledScripts.includes(name);
            //console.log(`[${extensionName} DEBUG]     Checking script "${name}" for ON command: currently enabled = ${isEnabled}. Needs ON command: ${!isEnabled}`);
            return !isEnabled; // 현재 활성화(ON) 되어 있지 않은 것만 true
        });
        //console.log(`[${extensionName} DEBUG]   Scripts identified to turn ON:`, JSON.stringify(scriptsToTurnOn));

        const commandParts = scriptsToTurnOn.map(name => `/regex-toggle state=on "${name}"`);
        const finalCommand = commandParts.join(' | ');
        //console.log(`[${extensionName} DEBUG] Finished generateAllOnCommandString. Final Generated Command: "${finalCommand}"`);
        return finalCommand;

    } catch (error) {
        console.error(`[${extensionName} DEBUG] Error generating 'all on' command:`, error);
        return "";
    }
}

// (제거됨) executeCombinedCommands 함수는 /RegexChain 콜백 내부 로직으로 통합됨 (변경 없음)

// === 나머지 헬퍼 함수 (변경 없음) ===
async function executeQuickReplyByNameSafe(targetName, args = {}, options = {}) {
    if (!targetName || typeof targetName !== 'string' || targetName.trim() === '') {
        console.error(`[${extensionName}] executeQuickReplyByNameSafe: Valid QR name required.`);
        return null;
    }
    const trimmedName = targetName.trim();
    if (typeof window.executeQuickReplyByName === 'function') {
        try {
            // console.log(`[${extensionName}] Executing Quick Reply: "${trimmedName}"`);
            const result = await window.executeQuickReplyByName(trimmedName, args, options);
            return result !== undefined ? result : true; // 성공 시 true 반환
        } catch (error) {
            // 오류 로그는 여기서 남기지만, 최종 피드백은 호출 측에서 처리
            console.error(`[${extensionName}] Error executing Quick Reply "${trimmedName}":`, error);
            return null; // 실패 시 null 반환
        }
    } else {
        console.error(`[${extensionName}] window.executeQuickReplyByName not found.`);
        return null;
    }
}

function executeCommandString(commandString) {
    if (!commandString || typeof commandString !== 'string' || commandString.trim() === '') {
        console.warn(`[${extensionName}] executeCommandString: Empty command string provided.`);
        return;
    }

    const trimmedCmd = commandString.trim();
    console.log(`[${extensionName}] Attempting to execute command: [${trimmedCmd}]`); // 최종 명령어 시도 로그

    try {
        const textarea = document.getElementById('send_textarea');
        const sendButton = document.getElementById('send_but');

        if (!textarea) {
            throw new Error("Textarea (#send_textarea) not found.");
        }
        if (!sendButton) {
            throw new Error("Send button (#send_but) not found.");
        }

        textarea.value = trimmedCmd;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // console.log(`[${extensionName}] Found send button:`, sendButton);
        // console.log(`[${extensionName}] Send button disabled state: ${sendButton.disabled}`);

        if (sendButton.disabled) {
            console.warn(`[${extensionName}] Send button is disabled. Cannot click.`);
            return;
        }

        setTimeout(() => {
            try {
                // console.log(`[${extensionName}] Clicking send button now.`);
                sendButton.click();
                // console.log(`[${extensionName}] Send button clicked successfully for command: "${trimmedCmd}"`);
            } catch (clickError) {
                console.error(`[${extensionName}] Error occurred during sendButton.click():`, clickError);
                console.error(`[${extensionName}] Failed command was: "${trimmedCmd}"`);
            }
        }, 50); // 50ms 지연

    } catch (error) {
        console.error(`[${extensionName}] Error setting up command execution for "${trimmedCmd}":`, error);
        // throw error;
    }
}

// --- 확장 프로그램 초기화 & 설정 UI (변경 없음) ---
async function loadSettings() {
    for (const key in defaultSettings) {
        if (!extension_settings[extensionName].hasOwnProperty(key)) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    const protectedScriptsTextarea = document.getElementById('regexchain_protected_scripts');
    if (protectedScriptsTextarea) {
        protectedScriptsTextarea.value = extension_settings[extensionName].protectedScriptsString || "";
    }
    // <<< NEW: 보호 스크립트 UI 설정 >>>
    setupProtectedScriptsUI();
}



// NEW: 보호 스크립트 UI 관련 로직을 설정하는 함수
function setupProtectedScriptsUI() {
    const textarea = document.getElementById('regexchain_protected_scripts');
    const addBtn = document.getElementById('add_protected_script_btn');
    const removeBtn = document.getElementById('remove_protected_script_btn');
    const selectorDiv = document.getElementById('protected_scripts_selector');

    if (!textarea || !addBtn || !removeBtn || !selectorDiv) {
        console.error(`[${extensionName}] Protected scripts UI elements not found.`);
        return;
    }

    // Textarea 업데이트 및 설정 저장 함수 (중복 로직 방지)
    const updateProtectedScripts = (newNamesArray) => {
        const uniqueNames = [...new Set(newNamesArray)].filter(Boolean); // 중복 제거 및 빈 문자열 필터링
        const newValue = uniqueNames.join(', '); // 쉼표와 공백으로 구분
        textarea.value = newValue;
        extension_settings[extensionName].protectedScriptsString = newValue;
        // !!! 중요: Textarea 값을 프로그래밍 방식으로 변경 후, input 이벤트를 발생시켜
        // 기존의 저장 로직(saveSettingsDebounced)이 트리거되도록 함 !!!
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        //console.log(`[${extensionName} DEBUG] Updated protected scripts: [${newValue}] and triggered input event.`);
    };

    // 현재 보호된 스크립트 이름 배열 가져오기
    const getCurrentProtectedNames = () => {
        return parseRegexNames(textarea.value || ""); // parseRegexNames는 쉼표 또는 쉼표+공백 구분자 모두 처리 가능해야 함
    };

    // 목록 표시/숨김 및 내용 업데이트 함수
    const displaySelector = (mode) => { // mode: 'add' 또는 'remove'
        selectorDiv.innerHTML = ''; // 내용 초기화
        selectorDiv.style.display = 'block';

        const allScripts = getAllRegexScriptNamesFromUI();
        const protectedNames = getCurrentProtectedNames();

        let scriptsToList = [];
        if (mode === 'add') {
            scriptsToList = allScripts.filter(name => !protectedNames.includes(name));
             selectorDiv.dataset.mode = 'add'; // 현재 모드 저장
             if (scriptsToList.length === 0) {
                 selectorDiv.innerHTML = '<p>추가할 수 있는 스크립트가 없습니다.</p>';
                 return;
             }
        } else { // mode === 'remove'
            scriptsToList = protectedNames;
             selectorDiv.dataset.mode = 'remove'; // 현재 모드 저장
             if (scriptsToList.length === 0) {
                 selectorDiv.innerHTML = '<p>현재 보호된 스크립트가 없습니다.</p>';
                 return;
             }
        }

        scriptsToList.sort().forEach(name => {
            const btn = document.createElement('button');
            btn.textContent = name;
            const icon = document.createElement('span');
            icon.classList.add('script-action-icon', 'fa-solid', mode === 'add' ? 'fa-plus' : 'fa-trash-can');
            btn.appendChild(icon);

            btn.addEventListener('click', () => {
                let currentProtected = getCurrentProtectedNames();
                if (mode === 'add') {
                    currentProtected.push(name);
                } else { // mode === 'remove'
                    currentProtected = currentProtected.filter(n => n !== name);
                }
                updateProtectedScripts(currentProtected);

                // 목록 즉시 업데이트 (선택된 항목 제거/추가)
                if (mode === 'add') {
                    btn.remove(); // 추가 목록에서 제거
                    if (selectorDiv.querySelectorAll('button').length === 0) {
                         selectorDiv.innerHTML = '<p>모든 스크립트가 추가되었습니다.</p>';
                    }
                } else { // mode === 'remove'
                    btn.remove(); // 제거 목록에서 제거
                     if (selectorDiv.querySelectorAll('button').length === 0) {
                         selectorDiv.innerHTML = '<p>보호된 스크립트가 없습니다.</p>';
                    }
                }
            });
            selectorDiv.appendChild(btn);
        });
    };

    // 버튼 클릭 리스너
    addBtn.addEventListener('click', () => {
        if (selectorDiv.style.display === 'block' && selectorDiv.dataset.mode === 'add') {
            selectorDiv.style.display = 'none'; // 이미 열려있으면 닫기
        } else {
            displaySelector('add'); // 추가 목록 표시
        }
    });

    removeBtn.addEventListener('click', () => {
         if (selectorDiv.style.display === 'block' && selectorDiv.dataset.mode === 'remove') {
            selectorDiv.style.display = 'none'; // 이미 열려있으면 닫기
        } else {
            displaySelector('remove'); // 제거 목록 표시
        }
    });

    // Textarea 외부 클릭 시 목록 숨기기 (선택 사항, UX 개선)
    // document.addEventListener('click', (event) => {
    //     if (!selectorDiv.contains(event.target) && event.target !== addBtn && event.target !== removeBtn) {
    //         selectorDiv.style.display = 'none';
    //     }
    // });

    // 기존 Textarea input 리스너는 그대로 유지 (직접 수정 시 저장)
    // $('#regexchain_protected_scripts').on('input', function() { ... }); 이 부분은 이미 jQuery 로드 부분에 있을 것임.
    // 단, 위 updateProtectedScripts 함수 내에서 input 이벤트를 dispatch하므로,
    // 이 리스너가 무한 루프에 빠지지 않도록 주의해야 하지만, 이벤트 디스패치는 사용자 입력과 동일하게 처리되므로 일반적으로 문제 없음.

}


// --- 슬래시 커맨드 등록 ---
/*
// (1단계) 테스트용 커맨드 (유지, 변경 없음)
SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'testExecCmd',
    helpString: '(테스트용) 주어진 명령어 문자열을 executeCommandString 함수로 실행합니다.',
    callback: (args, value) => { if (!value?.trim()) return "오류: 실행할 명령어 문자열 제공 필요."; try { executeCommandString(value); return `명령어 실행 시도: "${value.trim()}"`; } catch (error) { console.error(`[/testExecCmd] Error:`, error); return `오류 발생: ${error.message}`; } },
    unnamedArgumentList: [ SlashCommandArgument.fromProps({ name: 'command', description: '실행할 전체 명령어 문자열', isRequired: true, typeList: [ARGUMENT_TYPE.STRING] }) ],
}));
SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'testParseNames', 
    helpString: '(테스트용) 쉼표로 구분된 문자열을 parseRegexNames 함수로 파싱하고 결과를 반환합니다.',
    callback: (args, value) => { if (typeof value !== 'string' && value != null) return "오류: 문자열 인자 필요."; try { const parsed = parseRegexNames(value ?? ""); return `파싱 결과: [${parsed.join(', ')}] (원본: "${value ?? ""}")`; } catch (error) { console.error(`[/testParseNames] Error:`, error); return `오류 발생: ${error.message}`; } },
    unnamedArgumentList: [ SlashCommandArgument.fromProps({ name: 'names', description: '쉼표 구분 Regex 이름 문자열', isRequired: false, typeList: [ARGUMENT_TYPE.STRING] }) ],
}));
*/
// (2단계) /regexSet 명령어 (콜백 함수는 변경 없으나, 사용하는 generateAllOnCommandString 함수가 최적화됨)
// CORRECTED + ADVANCED DEBUG: /regexSet 명령어 콜백 함수 (변경 없음)
async function handleRegexSetCommand(args, value) {
    const rawRegexString = args.regex; // .trim() 전 원본 값
    const regexString = args.regex?.trim(); // .trim() 후 값
    const rawForceValue = args.force;
    const isForced = rawForceValue === true || String(rawForceValue).toLowerCase() === 'true';

    // --- 추가 디버깅 로그 ---
    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Raw regex input: "${rawRegexString}" (length: ${rawRegexString?.length})`);
    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Trimmed regexString: "${regexString}" (length: ${regexString?.length})`);
    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] KEYWORD_ALL_OFF constant: "${KEYWORD_ALL_OFF}" (length: ${KEYWORD_ALL_OFF?.length})`);

    // 각 문자의 코드 값 출력 (핵심 디버깅)
    let regexStringCodes = regexString ? Array.from(regexString).map(char => char.charCodeAt(0)).join(',') : 'null';
    let keywordCodes = KEYWORD_ALL_OFF ? Array.from(KEYWORD_ALL_OFF).map(char => char.charCodeAt(0)).join(',') : 'null';
    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Codes for trimmed regexString: [${regexStringCodes}]`);
    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Codes for KEYWORD_ALL_OFF:   [${keywordCodes}]`);

    const comparisonResult = regexString === KEYWORD_ALL_OFF;
    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Comparing trimmed regexString === KEYWORD_ALL_OFF: ${comparisonResult}`);
    // --- 추가 디버깅 로그 끝 ---

    //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Processing with received regexString: "${regexString}", isForced: ${isForced}`); // 이전 로그 위치 변경

    try {
        let commandString = "";
        let feedbackMessage = "";

        // --- 올바른 조건 분기 로직 ---
        if (!regexString) { // 1. 인자 없음
            //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Branch 1: No regexString provided.`);
            const allScriptNames = getAllRegexScriptNamesFromUI();
            const enabledScriptNames = getCurrentlyEnabledRegexScriptNames();
            let statusList = allScriptNames.map(name => `${name} (${enabledScriptNames.includes(name) ? 'ON' : 'OFF'})`);
            return allScriptNames.length > 0 ? `사용 가능한 Regex:\n[${statusList.join(',\n')}]` : "사용 가능한 Regex 스크립트 없음.";
        }
        else if (regexString === KEYWORD_ALL_OFF) { // 2. "_all_off_" 키워드 처리
            //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Branch 2: KEYWORD_ALL_OFF detected.`);
            commandString = generateAllOffCommandString(!isForced); // 최적화된 OFF 사용 (변경 없음)
            feedbackMessage = isForced
                ? "현재 활성화된 모든 Regex 강제 비활성화 시도 (보호 설정 무시)."
                : "현재 활성화된 모든 비보호 Regex 스크립트 비활성화 시도.";
        }
        else if (regexString === KEYWORD_ALL_ON) { // 3. "_all_on_" 키워드 처리
            //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Branch 3: KEYWORD_ALL_ON detected.`);
            commandString = generateAllOnCommandString(); // 최적화된 ON 사용 (수정됨)
            feedbackMessage = "현재 OFF 상태인 모든 Regex 스크립트 활성화 시도."; // 피드백 메시지 수정
        }
        else { // 4. 일반 Regex 이름 목록 처리
            //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Branch 4: Processing as regular regex names list.`);
            const targetNames = parseRegexNames(regexString);
             //console.log(`[${extensionName} DEBUG - handleRegexSetCommand]   Parsed targetNames:`, JSON.stringify(targetNames));
            // generateRegexToggleCommands는 ON/OFF 모두 최적화됨
            commandString = generateRegexToggleCommands(targetNames, true); // turnOthersOff=true 명시 (기본값이지만 명확히)
            if (targetNames.length > 0) {
                 feedbackMessage = `Regex 설정: [${targetNames.join(', ')}] 활성화 시도 (현재 OFF 상태인 것만). 다른 활성&비보호 Regex는 비활성화 시도.`; // 피드백 메시지 수정
            } else {
                 // regex 인자가 있었지만 파싱 결과가 빈 경우 (e.g., /regexSet regex=", , ")
                 // 또는 regex 인자가 유효하지 않은 이름만 포함한 경우 (파싱은 되지만 아래 generate에서 target이 없음)
                 // 이 경우, OFF 명령어만 생성됨 (turnOthersOff=true 이므로)
                 commandString = generateRegexToggleCommands([], true);
                 feedbackMessage = `활성화할 유효한 Regex 이름 없음. 현재 활성화된 모든 비보호 Regex 비활성화 시도.`; // 피드백 메시지 수정
                 //console.log(`[${extensionName} DEBUG - handleRegexSetCommand]   Parsed targetNames is empty or invalid, generating command to turn off all enabled non-protected.`);
            }
        }
        // --- 조건 분기 로직 끝 ---


        //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] Final commandString to execute: "${commandString}"`);

        if (commandString) {
            executeCommandString(commandString);
            return feedbackMessage;
        } else {
            //console.log(`[${extensionName} DEBUG - handleRegexSetCommand] No command string generated.`);
            // 명령어 없는 이유 추가: 이미 원하는 상태이거나, 대상이 없거나 등
            let noCommandReason = "실행할 Regex 토글 명령어가 없습니다";
            if (regexString === KEYWORD_ALL_ON) noCommandReason += " (모든 스크립트가 이미 ON 상태일 수 있음).";
            else if (regexString === KEYWORD_ALL_OFF) noCommandReason += " (현재 활성화된 비보호 스크립트가 없음).";
            else if (targetNames?.length > 0) noCommandReason += " (지정한 스크립트가 이미 ON 상태이고, 끌 다른 스크립트도 없을 수 있음).";
            else noCommandReason += " (지정한 유효 스크립트가 없고, 끌 다른 스크립트도 없을 수 있음).";
            return feedbackMessage || noCommandReason;
        }

    } catch (error) {
        console.error(`[/regexSet] Error:`, error);
        return `오류 발생: ${error.message}`;
    }
}


// === 3단계: /RegexChain 슬래시 커맨드 수정 (QR 분리, ON 최적화, profile/model 필수화?) ===

/**
 * MODIFIED: /RegexChain 명령어 콜백 함수 (QR 기능 제거, ON 명령어 최적화)
 * profile 또는 model 인자 중 하나는 필수로 받도록 수정.
 */
async function handleRegexChainCommand(args, value) {
    const { profile, model, regex } = args; // qr 제거
    let feedbackMessages = [];
    let warnings = [];

    //console.log(`[${extensionName} DEBUG - handleRegexChainCommand] Received args:`, args);

    try {
        // 1. 인자 유효성 검사 (수정: profile/model 중 하나 필수)
        if (profile && model) {
            return `오류: profile과 model 인자는 동시에 사용할 수 없습니다. 하나만 지정해주세요.`;
        }
        if (!profile && !model) {
            // regex만 단독으로 사용하는 경우를 허용하지 않음 (사용자 요청 반영). /regexSet 사용 유도.
            return `오류: profile 또는 model 인자 중 하나를 반드시 지정해야 합니다. Regex만 설정하려면 /regexSet 명령어를 사용하세요. 사용법: /RegexChain help=true`;
        }
        // profile 또는 model 중 하나는 반드시 존재함

        // 2. 주요 동작 식별 (profile/model)
        let optionalCommandPart = "";
        let mainActionDescription = "";
        let mainActionValue = null;

        if (profile) {
            if (typeof profile !== 'string' || profile.trim() === '') return "오류: profile 인자에 유효한 프로필 이름을 제공해야 합니다.";
            mainActionValue = profile.trim();
            // TODO: 프로필 존재 확인 (이전과 동일)
            optionalCommandPart = generateOptionalCommand(mainActionValue, 'profile');
            mainActionDescription = `프로필 "${mainActionValue}" 로드`;
        } else if (model) { // profile이 없으면 model은 반드시 존재
            if (typeof model !== 'string' || model.trim() === '') return "오류: model 인자에 유효한 모델 이름을 제공해야 합니다.";
            mainActionValue = model.trim();
            // TODO: 모델 존재 확인 (이전과 동일)
            optionalCommandPart = generateOptionalCommand(mainActionValue, 'model');
            mainActionDescription = `모델 "${mainActionValue}" 로드`;
        }

        // 3. Regex 설정 준비 (존재 여부 확인 + 최적화된 토글 사용)
        let regexCommandPart = "";
        let regexDescription = "";
        let targetNamesToEnable = []; // 실제 활성화할 (존재하는) Regex 이름 목록

        if (regex !== undefined) { // regex 인자가 명시적으로 주어졌을 때만 처리
            if (typeof regex !== 'string') return "오류: regex 인자는 쉼표로 구분된 문자열이어야 합니다.";

            const requestedNames = parseRegexNames(regex);
            const allAvailableNames = getAllRegexScriptNamesFromUI();
            const existingNames = [];
            const nonExistingNames = [];

            requestedNames.forEach(name => {
                if (allAvailableNames.includes(name)) {
                    existingNames.push(name);
                } else {
                    nonExistingNames.push(name);
                }
            });

            if (nonExistingNames.length > 0) {
                warnings.push(`경고: 다음 Regex 스크립트는 존재하지 않아 무시됩니다: [${nonExistingNames.join(', ')}]`);
            }

            targetNamesToEnable = existingNames;

            // Regex 명령어 및 설명 생성 (최적화된 generateRegexToggleCommands 사용, turnOthersOff=true)
            // ON 명령어는 현재 OFF 상태인 것만, OFF 명령어는 현재 ON 상태인 비보호&비대상만 생성됨
            regexCommandPart = generateRegexToggleCommands(targetNamesToEnable, true); // turnOthersOff=true 명시

            if (targetNamesToEnable.length > 0) {
                regexDescription = `Regex [${targetNamesToEnable.join(', ')}] 활성화 시도 (현재 OFF 상태인 것만). 다른 활성&비보호 Regex는 비활성화 시도`;
            } else {
                // regex 인자는 있었으나 유효한 이름이 없거나 빈 문자열("")이었던 경우
                if (requestedNames.length > 0 || regex.trim() !== '') { // 원래 뭔가 요청은 했었음
                     regexDescription = "요청한 Regex 스크립트가 모두 존재하지 않거나 이미 활성화됨. 현재 활성화된 다른 비보호 Regex 비활성화 시도";
                } else { // regex="" 인 경우
                     regexDescription = "현재 활성화된 모든 비보호 Regex 비활성화 시도";
                }
                // 이 경우에도 generateRegexToggleCommands([], true)가 호출되어 OFF 명령어만 생성될 수 있음
            }
        } else {
            regexDescription = "Regex 상태 변경 없음";
        }

        // 4. 명령어 실행 (Profile/Model + Regex 동시 실행)
        const partsToExecute = [optionalCommandPart, regexCommandPart].filter(Boolean);
        let combinedDescription = mainActionDescription; // 주요 동작은 항상 있음

        if (regexCommandPart || regex !== undefined) { // Regex 관련 작업이 있거나 시도된 경우
             combinedDescription += " 및 " + regexDescription;
        } else { // regex 인자 자체가 없었을 때
             combinedDescription += " 및 " + regexDescription; // "Regex 상태 변경 없음"
        }

        feedbackMessages.push(combinedDescription + " 시도...");

        if (partsToExecute.length > 0) {
            const finalCommand = partsToExecute.join(' | ');
            try {
                executeCommandString(finalCommand);
                feedbackMessages.push("완료.");
            } catch (cmdError) {
                feedbackMessages.push("실패.");
                console.error(`[/RegexChain] Error executing command:`, cmdError);
            }
        } else {
             // 실행할 명령어가 없는 경우 (e.g., 프로필/모델 로드 실패? 또는 Regex가 이미 원하는 상태)
             feedbackMessages.push("실행할 명령어가 생성되지 않았습니다 (이미 원하는 상태일 수 있음).");
             console.log(`[${extensionName} DEBUG - handleRegexChainCommand] No commands generated. OptionalPart: "${optionalCommandPart}", RegexPart: "${regexCommandPart}"`);
        }


        // 5. 최종 피드백 반환 (경고 포함)
        let finalFeedback = feedbackMessages.join(' ');
        if (warnings.length > 0) {
            finalFeedback += "\n" + warnings.join('\n');
        }
        return finalFeedback;

    } catch (error) {
        console.error(`[/RegexChain] Unexpected error:`, error);
        return `예상치 못한 오류 발생: ${error.message}`;
    }
}


// === 4단계: 신규 /RegexChainQR 슬래시 커맨드 ===

/**
 * NEW: /RegexChainQR 명령어 콜백 함수
 * QR 실행 후 지정된 Regex 스크립트 중 현재 OFF 상태인 것만 활성화합니다.
 * 다른 스크립트는 비활성화하지 않습니다.
 */
async function handleRegexChainQRCommand(args, value) {
    const { qr, regex } = args;
    let feedbackMessages = [];
    let warnings = [];

    //console.log(`[${extensionName} DEBUG - handleRegexChainQRCommand] Received args:`, args);

    try {
        // 1. 인자 유효성 검사
        if (!qr || typeof qr !== 'string' || qr.trim() === '') {
            return `오류: qr 인자에 유효한 Quick Reply 이름을 제공해야 합니다.`;
        }
        const qrName = qr.trim();

        if (!regex || typeof regex !== 'string' || regex.trim() === '') {
            // Regex 목록은 필수로 받도록 함 (빈 문자열 "" 허용 안 함)
            return `오류: regex 인자에 활성화할 Regex 스크립트 이름을 하나 이상 쉼표로 구분하여 제공해야 합니다.`;
        }
        const regexString = regex.trim();

        // 2. Quick Reply 실행
        feedbackMessages.push(`Quick Reply "${qrName}" 실행 시도...`);
        const qrResult = await executeQuickReplyByNameSafe(qrName);

        if (qrResult === null) {
            feedbackMessages.push(`실패 (Quick Reply '${qrName}'을(를) 찾을 수 없거나 실행 중 오류 발생). Regex 설정은 진행하지 않습니다.`);
            // QR 실패 시 여기서 종료
            return feedbackMessages.join(' ');
        } else {
            feedbackMessages.push("완료."); // QR 성공
        }

        // 3. Regex 설정 준비 (지정된 것만 ON, 최적화 적용)
        const requestedNames = parseRegexNames(regexString);
        if (requestedNames.length === 0) {
            // parseRegexNames가 빈 배열 반환 (e.g., regex=", , ")
             feedbackMessages.push(`경고: regex 인자에 유효한 스크립트 이름이 없습니다. Regex 설정 건너뜀.`);
             return feedbackMessages.join(' ');
        }

        const allAvailableNames = getAllRegexScriptNamesFromUI();
        const currentlyEnabledScripts = getCurrentlyEnabledRegexScriptNames(); // 최신 상태 가져오기
        const existingNamesToEnable = [];
        const nonExistingNames = [];

        requestedNames.forEach(name => {
            if (allAvailableNames.includes(name)) {
                existingNamesToEnable.push(name);
            } else {
                nonExistingNames.push(name);
            }
        });

        if (nonExistingNames.length > 0) {
            warnings.push(`경고: 다음 Regex 스크립트는 존재하지 않아 무시됩니다: [${nonExistingNames.join(', ')}]`);
        }

        // 실제 ON 명령어를 생성할 대상 필터링: 존재하고 & 현재 OFF 상태인 스크립트
        const scriptsToActuallyTurnOn = existingNamesToEnable.filter(name => {
             const isEnabled = currentlyEnabledScripts.includes(name);
             //console.log(`[${extensionName} DEBUG - handleRegexChainQRCommand] Checking script "${name}" for ON: currently enabled = ${isEnabled}. Needs ON: ${!isEnabled}`);
             return !isEnabled;
        });

        let regexCommandPart = "";
        let regexDescription = "";

        if (scriptsToActuallyTurnOn.length > 0) {
             // turnOthersOff=false 로 설정하여 다른 스크립트를 끄지 않도록 함
             regexCommandPart = generateRegexToggleCommands(scriptsToActuallyTurnOn, false);
             regexDescription = `Regex [${scriptsToActuallyTurnOn.join(', ')}] 활성화 시도 (현재 OFF 상태인 것만)`;
        } else {
             // 켤 스크립트가 없는 경우 (모두 존재하지 않거나, 이미 켜져 있음)
             regexDescription = `요청한 모든 Regex 스크립트가 존재하지 않거나 이미 활성화 상태입니다.`;
             if (existingNamesToEnable.length > 0) { // 존재는 하지만 이미 켜진 경우
                 regexDescription = `요청한 Regex 스크립트 [${existingNamesToEnable.join(', ')}] (이)가 이미 활성화 상태입니다.`;
             }
        }

        // 4. Regex 명령어 실행
        feedbackMessages.push(regexDescription + " 시도...");
        if (regexCommandPart) {
            try {
                executeCommandString(regexCommandPart);
                feedbackMessages.push("완료.");
            } catch (cmdError) {
                feedbackMessages.push("실패.");
                console.error(`[/RegexChainQR] Error executing regex command after QR:`, cmdError);
            }
        } else {
            // 실행할 명령어가 없는 경우 (이미 ON 상태 등)
             feedbackMessages.push("실행할 Regex 명령 없음.");
        }

        // 5. 최종 피드백 반환
        let finalFeedback = feedbackMessages.join(' ');
        if (warnings.length > 0) {
            finalFeedback += "\n" + warnings.join('\n');
        }
        return finalFeedback;

    } catch (error) {
        console.error(`[/RegexChainQR] Unexpected error:`, error);
        return `예상치 못한 오류 발생: ${error.message}`;
    }
}









jQuery(async () => {
	
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);

        // 기존 Textarea 리스너 (이 위치 유지 또는 setup 함수 내부로 이동 가능)
        $('#regexchain_protected_scripts').on('input', function() {
            // 이 리스너는 사용자가 *직접* 타이핑할 때와,
            // 프로그래밍 방식으로 input 이벤트가 발생했을 때 모두 호출됨.
            extension_settings[extensionName].protectedScriptsString = $(this).val();
            saveSettingsDebounced();
            console.log(`[${extensionName} DEBUG] Textarea input event handled. Saved: "${$(this).val()}"`);
        });

        await loadSettings(); // loadSettings 내부에서 setupProtectedScriptsUI() 호출
        console.log(`[${extensionName}] Extension initialized and ready.`);
    } catch (error) {
        console.error(`[${extensionName}] Failed to load settings HTML or initialize:`, error);
    }
	
});











// /regexSet 등록 부분 (helpString 등 일부 수정)
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'regexSet',
    helpString: `지정한 Regex 스크립트만 활성화 하거나 모든 Regex를 제어합니다.\n` +
                `사용법:\n` +
                `- /regexSet regex="이름1, 이름2"` + ` : 이름1, 이름2 활성화 시도 (현재 OFF 상태인 것만). 다른 활성&비보호 Regex는 비활성화 시도.\n` +
                `- /regexSet regex=${KEYWORD_ALL_ON}` + ` : 현재 OFF 상태인 모든 스크립트 활성화 시도\n` +
                `- /regexSet regex=${KEYWORD_ALL_OFF}` + ` : 현재 활성화된 모든 비보호 스크립트 비활성화 시도 (기본)\n` +
                `- /regexSet regex=${KEYWORD_ALL_OFF} force=true` + ` : 현재 활성화된 모든 스크립트 강제 비활성화 시도 (보호 무시)\n` +
                `- /regexSet` + ` : 사용 가능한 스크립트 목록 및 상태 표시`,
    callback: handleRegexSetCommand,
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name: 'regex',
            description: `활성화할 Regex 이름(쉼표 구분), '${KEYWORD_ALL_ON}', 또는 '${KEYWORD_ALL_OFF}'. 비워두면 목록/상태 표시.`,
            isRequired: false,
            typeList: [ARGUMENT_TYPE.STRING],
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'force',
            description: `'${KEYWORD_ALL_OFF}' 사용 시 보호 설정을 무시할지 여부 (true/false). 기본값: false`,
            isRequired: false,
            typeList: [ARGUMENT_TYPE.BOOLEAN],
            defaultValue: false,
        }),
    ],
}));
console.log(`[${extensionName}] Command '/regexSet' registered.`);


// /RegexChain 등록 부분 수정 (qr 제거, 도움말 수정)
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'RegexChain',
    helpString: `주요 동작(프로필/모델 로드)과 Regex 스크립트 설정을 함께 실행합니다.\n` +
                `profile 또는 model 인자 중 하나는 반드시 필요합니다.\n` +
                `regex 인자가 제공되면, 지정된 스크립트 중 현재 OFF 상태인 것만 활성화하고, 다른 활성&비보호 스크립트는 비활성화합니다.\n` +
                `사용법:\n` +
                `- /RegexChain profile="이름" regex="스크립트1,스크립트2"` + ` : 프로필 로드 + 지정 Regex 활성화(OFF->ON만) & 다른 활성&비보호 끄기 시도\n` +
                `- /RegexChain model="이름" regex="스크립트"` + ` : 모델 로드 + 지정 Regex 활성화(OFF->ON만) & 다른 활성&비보호 끄기 시도\n` +
                `- /RegexChain profile="이름"` + ` : 프로필만 로드 (Regex 변경 없음)\n` +
                `- /RegexChain model="이름" regex=""` + ` : 모델 로드 + 현재 활성화된 모든 비보호 Regex 비활성화 시도\n` +
                `- /RegexChain help=true` + ` : 도움말 보기`,
    callback: handleRegexChainCommand,
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name: 'profile',
            description: '로드할 프로필 이름. model과 함께 사용할 수 없음.',
            isRequired: false, // 콜백 시작 시 검증하므로 false 유지
            typeList: [ARGUMENT_TYPE.STRING],
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'model',
            description: '로드할 모델 이름. profile과 함께 사용할 수 없음.',
            isRequired: false, // 콜백 시작 시 검증하므로 false 유지
            typeList: [ARGUMENT_TYPE.STRING],
        }),
        // qr 인자 제거됨
        SlashCommandNamedArgument.fromProps({
            name: 'regex',
            description: '설정할 Regex 스크립트 이름 (쉼표 구분). 지정 시 해당 스크립트만 ON 시도(OFF->ON), 다른 활성&비보호는 OFF 시도. "" 값은 활성&비보호 OFF 시도. 생략 시 Regex 변경 없음.',
            isRequired: false,
            typeList: [ARGUMENT_TYPE.STRING],
        }),
    ],
}));
console.log(`[${extensionName}] Command '/RegexChain' (modified) registered.`);


// /RegexChainQR 등록
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'RegexChainQR',
    helpString: `Quick Reply를 실행한 후, 지정된 Regex 스크립트 중 현재 OFF 상태인 것만 활성화합니다.\n` +
                `다른 Regex 스크립트의 상태는 변경하지 않습니다.\n` +
                `사용법:\n` +
                `- /RegexChainQR qr="이름" regex="스크립트1,스크립트2"` + ` : QR 실행 후, 스크립트1, 스크립트2 활성화 시도 (OFF->ON만)\n` +
                `- /RegexChainQR help=true` + ` : 도움말 보기`,
    callback: handleRegexChainQRCommand,
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name: 'qr',
            description: '실행할 Quick Reply 이름.',
            isRequired: true, // 필수 인자
            typeList: [ARGUMENT_TYPE.STRING],
        }),
        SlashCommandNamedArgument.fromProps({
            name: 'regex',
            description: '활성화할 Regex 스크립트 이름 (쉼표 구분, 최소 1개 필수).',
            isRequired: true, // 필수 인자
            typeList: [ARGUMENT_TYPE.STRING],
        }),
    ],
}));
console.log(`[${extensionName}] Command '/RegexChainQR' registered.`);


// --- END OF FILE index.js ---
/*  아래는 테스트용 코드입니다

window.executeQuickReplyByName('HiddenUtils.11')
/RegexChainQR qr="11.테스팅" regex="없는거1, 생각접기"
/RegexChain profile="ARP" regex="없는거1, 생각접기"

/regexSet | /echo {{pipe}}
/regexSet regex=_all_off_ force=true
/regexSet regex=_all_on_ force=true
/RegexChain profile=ARP regex=생각접기 // profile 필수, ON 최적화, 다른것 끄기
/RegexChain model=MythoMax regex=생각접기, 생각접기2 // model 필수, ON 최적화, 다른것 끄기
/RegexChain profile=ARP // profile 필수, Regex 변경 없음
/RegexChain model=MythoMax regex="" // model 필수, 활성&비보호 끄기 시도
/RegexChainQR qr=자동번역OFF regex=생각접기 // qr 필수, 지정된것만 ON (최적화), 다른것 안 끔
/RegexChainQR qr=자동번역ON regex=생각접기, 생각접기2 // qr 필수, 지정된것만 ON (최적화), 다른것 안 끔

*/