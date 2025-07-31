import jSuites from 'jsuites';

import dispatch from "./dispatch.js";
import { getMask, isFormula, updateCell } from "./internal.js";
import { setHistory } from './history.js';

// 전역 편집기 (Luckysheet 방식)
export let globalEditor = null;
let globalEditorType = null; // 'input', 'textarea', 'contenteditable'

// 전역 편집기 자동 초기화
const autoInitGlobalEditor = function() {
    if (!globalEditor) {
        initGlobalEditor();
    }
};

// 페이지 로드 시 전역 편집기 미리 초기화
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', autoInitGlobalEditor);
    // 이미 로드된 경우 즉시 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitGlobalEditor);
    } else {
        autoInitGlobalEditor();
    }
}

/**
 * 전역 편집기 초기화
 */
const initGlobalEditor = function() {
    if (globalEditor && globalEditor.isInitialized) {
        return globalEditor;
    }
    
    // contenteditable div로 생성 (Luckysheet와 동일)
    globalEditor = document.createElement('div');
    globalEditor.id = 'jspreadsheet-global-editor';
    globalEditor.contentEditable = true;
    globalEditor.style.position = 'absolute';
    globalEditor.style.zIndex = '1000';
    globalEditor.style.padding = '2px';
    globalEditor.style.fontFamily = 'inherit';
    globalEditor.style.fontSize = 'inherit';
    globalEditor.style.left = '-9999px';
    globalEditor.style.top = '-9999px';
    globalEditor.style.width = '100px';
    globalEditor.style.height = '30px';
    globalEditor.style.backgroundColor = 'white';
    globalEditor.style.outline = 'none';
    globalEditor.style.border = 'none';
    globalEditor.style.pointerEvents = 'none';
    globalEditor.style.whiteSpace = 'pre-wrap';
    globalEditor.style.wordWrap = 'break-word';
    globalEditor.style.overflow = 'hidden';
    
    // 한글 입력을 위한 이벤트 처리
    let isComposing = false;
    let pendingInput = null;
    
    globalEditor.addEventListener('compositionstart', () => {
        isComposing = true;
    });
    
    globalEditor.addEventListener('compositionend', () => {
        isComposing = false;
        // 조합 완료 후 pending된 입력 처리
        if (pendingInput) {
            globalEditor.textContent = pendingInput;
            pendingInput = null;
        }
    });
    
    globalEditor.addEventListener('input', (e) => {
        if (isComposing) {
            // 조합 중이면 pending
            pendingInput = e.target.textContent;
            return;
        }
        // 조합이 완료된 경우 정상 처리
    });
    
    // 편집기 닫기 이벤트 - focus 유지를 위해 blur 이벤트 제거
    // blur 이벤트는 focus가 풀릴 때마다 발생하므로 제거
    // 대신 Enter 키나 다른 명시적인 액션으로만 편집기 닫기
    
    // 키보드 이벤트 처리
    globalEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (globalEditor.currentCell) {
                closeEditor.call(globalEditor.currentObj, globalEditor.currentCell, true);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (globalEditor.currentCell) {
                closeEditor.call(globalEditor.currentObj, globalEditor.currentCell, false);
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (globalEditor.currentCell) {
                closeEditor.call(globalEditor.currentObj, globalEditor.currentCell, true);
            }
        }
    });
    
    document.body.appendChild(globalEditor);
    globalEditorType = 'contenteditable';
    
    // 초기화 완료 표시
    globalEditor.isInitialized = true;
    
    // 전역 편집기 focus 유지를 위한 이벤트 리스너
    document.addEventListener('click', (e) => {
        if (globalEditor && globalEditor.currentCell && e.target !== globalEditor && !globalEditor.contains(e.target)) {
            // 편집기 외부 클릭 시 편집기 닫기
            closeEditor.call(globalEditor.currentObj, globalEditor.currentCell, true);
        }
    });
    
    return globalEditor;
};

/**
 * 전역 편집기 위치 조정
 */
const positionGlobalEditor = function(cell) {
    // 전역 편집기가 없거나 초기화되지 않은 경우 초기화
    if (!globalEditor || !globalEditor.isInitialized) {
        initGlobalEditor();
    }
    
    const rect = cell.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    globalEditor.style.left = (rect.left + scrollLeft) + 'px';
    globalEditor.style.top = (rect.top + scrollTop) + 'px';
    globalEditor.style.width = rect.width - 5 + 'px';
    globalEditor.style.height = rect.height - 5 + 'px';
    globalEditor.style.pointerEvents = 'auto';
};

/**
 * Open the editor
 *
 * @param object cell
 * @return void
 */
export const openEditor = function(cell, empty, e) {
    const obj = this;

    // Get cell position
    const y = cell.getAttribute('data-y');
    const x = cell.getAttribute('data-x');

    // On edition start
    dispatch.call(obj, 'oneditionstart', obj, cell, parseInt(x), parseInt(y));

    // Overflow
    if (x > 0) {
        obj.records[y][x-1].element.style.overflow = 'hidden';
    }

    // Readonly
    if (cell.classList.contains('readonly') == true) {
        // Do nothing
    } else {
        // Holder
        obj.edition = [ obj.records[y][x].element, obj.records[y][x].element.innerHTML, x, y ];

        // If there is a custom editor for it
        if (obj.options.columns && obj.options.columns[x] && typeof obj.options.columns[x].type === 'object') {
            // Custom editors
            obj.options.columns[x].type.openEditor(cell, obj.options.data[y][x], parseInt(x), parseInt(y), obj, obj.options.columns[x], e);

            // On edition start
            dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);
        } else {
            // Native functions
            if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'hidden') {
                // Do nothing
            } else if (obj.options.columns && obj.options.columns[x] && (obj.options.columns[x].type == 'checkbox' || obj.options.columns[x].type == 'radio')) {
                // Get value
                const value = cell.children[0].checked ? false : true;
                // Toogle value
                obj.setValue(cell, value);
                // Do not keep edition open
                obj.edition = null;
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'dropdown') {
                // Get current value
                let value = obj.options.data[y][x];
                if (obj.options.columns[x].multiple && !Array.isArray(value)) {
                    value = value.split(';');
                }

                // Create dropdown
                let source;

                if (typeof(obj.options.columns[x].filter) == 'function') {
                    source = obj.options.columns[x].filter(obj.element, cell, x, y, obj.options.columns[x].source);
                } else {
                    source = obj.options.columns[x].source;
                }

                // Do not change the original source
                const data = [];
                if (source) {
                    for (let j = 0; j < source.length; j++) {
                        data.push(source[j]);
                    }
                }

                // Create editor
                const editor = document.createElement('div');
                editor.style.width = (cell.getBoundingClientRect().width) + 'px';
                editor.style.height = (cell.getBoundingClientRect().height - 2) + 'px';
                editor.style.minHeight = (cell.getBoundingClientRect().height - 2) + 'px';

                // Edit cell
                cell.classList.add('editor');
                cell.innerHTML = '';
                cell.appendChild(editor);

                // On edition start
                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                const options = {
                    data: data,
                    multiple: obj.options.columns[x].multiple ? true : false,
                    autocomplete: obj.options.columns[x].autocomplete ? true : false,
                    opened:true,
                    value: value,
                    width:'100%',
                    height:editor.style.minHeight,
                    position: (obj.options.tableOverflow == true || obj.parent.config.fullscreen == true) ? true : false,
                    onclose:function() {
                        closeEditor.call(obj, cell, true);
                    }
                };
                if (obj.options.columns[x].options && obj.options.columns[x].options.type) {
                    options.type = obj.options.columns[x].options.type;
                }
                jSuites.dropdown(editor, options);
            } else if (obj.options.columns && obj.options.columns[x] && (obj.options.columns[x].type == 'calendar' || obj.options.columns[x].type == 'color')) {
                // Value
                const value = obj.options.data[y][x];
                // Create editor
                const editor = document.createElement('input');
                editor.style.width = (cell.getBoundingClientRect().width) + 'px';
                editor.style.height = (cell.getBoundingClientRect().height - 2) + 'px';
                editor.style.minHeight = (cell.getBoundingClientRect().height - 2) + 'px';

                // Edit cell
                cell.classList.add('editor');
                cell.innerHTML = '';
                cell.appendChild(editor);

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.value = value;

                const options = obj.options.columns[x].options ? { ...obj.options.columns[x].options } : {};

                if (obj.options.tableOverflow == true || obj.parent.config.fullscreen == true) {
                    options.position = true;
                }
                options.value = obj.options.data[y][x];
                options.opened = true;
                options.onclose = function(el, value) {
                    closeEditor.call(obj, cell, true);
                }
                // Current value
                if (obj.options.columns[x].type == 'color') {
                    jSuites.color(editor, options);

                    const rect = cell.getBoundingClientRect();

                    if (options.position) {
                        editor.nextSibling.children[1].style.top = (rect.top + rect.height) + 'px';
                        editor.nextSibling.children[1].style.left = rect.left + 'px';
                    }
                } else {
                    if (!options.format) {
                        options.format = 'YYYY-MM-DD';
                    }

                    jSuites.calendar(editor, options);
                }
                // Focus on editor
                editor.focus();
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'html') {
                const value = obj.options.data[y][x];
                // Create editor
                const editor = document.createElement('div');
                editor.style.width = (cell.getBoundingClientRect().width) + 'px';
                editor.style.height = (cell.getBoundingClientRect().height - 2) + 'px';
                editor.style.minHeight = (cell.getBoundingClientRect().height - 2) + 'px';

                // Edit cell
                cell.classList.add('editor');
                cell.innerHTML = '';
                cell.appendChild(editor);

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.style.position = 'relative';
                const div = document.createElement('div');
                div.classList.add('jss_richtext');
                editor.appendChild(div);
                jSuites.editor(div, {
                    focus: true,
                    value: value,
                });
                const rect = cell.getBoundingClientRect();
                const rectContent = div.getBoundingClientRect();
                if (window.innerHeight < rect.bottom + rectContent.height) {
                    div.style.top = (rect.bottom - (rectContent.height + 2)) + 'px';
                } else {
                    div.style.top = (rect.top) + 'px';
                }

                if (window.innerWidth < rect.left + rectContent.width) {
                    div.style.left = (rect.right - (rectContent.width + 2)) + 'px';
                } else {
                    div.style.left = rect.left + 'px';
                }
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'image') {
                // Value
                const img = cell.children[0];
                // Create editor
                const editor = document.createElement('div');
                editor.style.width = (cell.getBoundingClientRect().width) + 'px';
                editor.style.height = (cell.getBoundingClientRect().height - 2) + 'px';
                editor.style.minHeight = (cell.getBoundingClientRect().height - 2) + 'px';

                // Edit cell
                cell.classList.add('editor');
                cell.innerHTML = '';
                cell.appendChild(editor);

                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);

                editor.style.position = 'relative';
                const div = document.createElement('div');
                div.classList.add('jclose');
                if (img && img.src) {
                    div.appendChild(img);
                }
                editor.appendChild(div);
                jSuites.image(div, obj.options.columns[x]);
                const rect = cell.getBoundingClientRect();
                const rectContent = div.getBoundingClientRect();
                if (window.innerHeight < rect.bottom + rectContent.height) {
                    div.style.top = (rect.top - (rectContent.height + 2)) + 'px';
                } else {
                    div.style.top = (rect.top) + 'px';
                }

                div.style.left = rect.left + 'px';
            } else {
                // 기본 텍스트 편집기 - 전역 편집기 사용
                const value = empty == true ? '' : obj.options.data[y][x];

                // 전역 편집기 초기화 및 위치 조정
                const editor = initGlobalEditor();
                positionGlobalEditor(cell);
                
                // 전역 편집기에 현재 정보 저장
                editor.currentObj = obj;
                editor.currentCell = cell;
                
                // 값 설정
                editor.textContent = value;
                
                // 포커스 및 커서 위치 설정
                editor.focus();
                
                // 커서를 끝으로 이동
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(editor);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                
                // On edition start
                dispatch.call(obj, 'oncreateeditor', obj, cell, parseInt(x), parseInt(y), null, obj.options.columns[x]);
            }
        }
    }
}

/**
 * Close the editor and save the information
 *
 * @param object cell
 * @param boolean save
 * @return void
 */
export const closeEditor = function(cell, save) {
    const obj = this;

    const x = parseInt(cell.getAttribute('data-x'));
    const y = parseInt(cell.getAttribute('data-y'));

    let value;

    // Get cell properties
    if (save == true) {
        // If custom editor
        if (obj.options.columns && obj.options.columns[x] && typeof obj.options.columns[x].type === 'object') {
            // Custom editor
            value = obj.options.columns[x].type.closeEditor(cell, save, parseInt(x), parseInt(y), obj, obj.options.columns[x]);
        } else {
            // Native functions
            if (obj.options.columns && obj.options.columns[x] && (obj.options.columns[x].type == 'checkbox' || obj.options.columns[x].type == 'radio' || obj.options.columns[x].type == 'hidden')) {
                // Do nothing
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'dropdown') {
                value = cell.children[0].dropdown.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'calendar') {
                value = cell.children[0].calendar.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'color') {
                value = cell.children[0].color.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'html') {
                value = cell.children[0].children[0].editor.getData();
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'image') {
                const img = cell.children[0].children[0].children[0];
                value = img && img.tagName == 'IMG' ? img.src : '';
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'numeric') {
                value = cell.children[0].value;
                if ((''+value).substr(0,1) != '=') {
                    if (value == '') {
                        value = obj.options.columns[x].allowEmpty ? '' : 0;
                    }
                }
                cell.children[0].onblur = null;
            } else {
                // 전역 편집기에서 값 가져오기
                if (globalEditor && globalEditor.currentCell === cell) {
                    value = globalEditor.textContent;
                    // 전역 편집기 비활성화 (화면 밖으로 이동)
                    globalEditor.style.left = '-9999px';
                    globalEditor.style.top = '-9999px';
                    globalEditor.style.width = '100px';
                    globalEditor.style.height = '30px';
                    globalEditor.style.backgroundColor = 'transparent';
                    globalEditor.style.border = 'none';
                    globalEditor.style.pointerEvents = 'none';
                    globalEditor.currentCell = null;
                    globalEditor.currentObj = null;
                } else {
                    value = cell.children[0].value;
                }
                
                // 전역 편집기가 아닌 경우에만 onblur 제거
                if (cell.children[0]) {
                    cell.children[0].onblur = null;
                }

                // Column options
                const options = obj.options.columns && obj.options.columns[x];

                if (options) {
                    // Format
                    const opt = getMask(options);
                    if (opt) {
                        // Keep numeric in the raw data
                        if (value !== '' && ! isFormula(value) && typeof(value) !== 'number') {
                            const t = jSuites.mask.extract(value, opt, true);
                            if (t && t.value !== '') {
                                value = t.value;
                            }
                        }
                    }
                }
            }
        }

        // Ignore changes if the value is the same
        if (obj.options.data[y][x] == value) {
            cell.innerHTML = obj.edition[1];
        } else {
            obj.setValue(cell, value);
        }
    } else {
        if (obj.options.columns && obj.options.columns[x] && typeof obj.options.columns[x].type === 'object') {
            // Custom editor
            obj.options.columns[x].type.closeEditor(cell, save, parseInt(x), parseInt(y), obj, obj.options.columns[x]);
        } else {
            if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'dropdown') {
                cell.children[0].dropdown.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'calendar') {
                cell.children[0].calendar.close(true);
            } else if (obj.options.columns && obj.options.columns[x] && obj.options.columns[x].type == 'color') {
                cell.children[0].color.close(true);
            } else {
                if (cell.children[0]) {
                    cell.children[0].onblur = null;
                }
            }
        }

        // Restore value
        cell.innerHTML = obj.edition && obj.edition[1] ? obj.edition[1] : '';
    }

    // On edition end
    dispatch.call(obj, 'oneditionend', obj, cell, x, y, value, save);

    // Remove editor class
    cell.classList.remove('editor');

    // Finish edition
    obj.edition = null;
}

/**
 * Toogle
 */
export const setCheckRadioValue = function() {
    const obj = this;

    const records = [];
    const keys = Object.keys(obj.highlighted);
    for (let i = 0; i < keys.length; i++) {
        const x = obj.highlighted[i].element.getAttribute('data-x');
        const y = obj.highlighted[i].element.getAttribute('data-y');

        if (obj.options.columns[x].type == 'checkbox' || obj.options.columns[x].type == 'radio') {
            // Update cell
            records.push(updateCell.call(obj, x, y, ! obj.options.data[y][x]));
        }
    }

    if (records.length) {
        // Update history
        setHistory.call(obj, {
            action:'setValue',
            records:records,
            selection:obj.selectedCell,
        });

        // On after changes
        const onafterchangesRecords = records.map(function(record) {
            return {
                x: record.x,
                y: record.y,
                value: record.newValue,
                oldValue: record.oldValue,
            };
        });

        dispatch.call(obj, 'onafterchanges', obj, onafterchangesRecords);
    }
}