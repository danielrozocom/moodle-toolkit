// ==UserScript==
// @name        Moodle Toolkit (Encuestas / Moodle / SCORM)
// @namespace   http://tampermonkey.net/
// @version     5.5.1
// @description Herramientas inteligentes y adaptativas para Moodle (Virtual) y BanWeb (Tierra).
// @author      Daniel Josue Rozo Vargas - www.danielrozo.com
// @icon        https://moodle.org/favicon.ico
// @match       https://virtual.unipiloto.edu.co/*
// @match       https://tierra.unipiloto.edu.co/*
// @grant       none
// @run-at      document-idle
// @updateURL   https://raw.githubusercontent.com/danielrozocom/moodle-toolkit/main/moodle-toolkit.user.js
// @downloadURL https://raw.githubusercontent.com/danielrozocom/moodle-toolkit/main/moodle-toolkit.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self && !window.location.href.includes('player.php') && !window.location.href.includes('bvsktess')) {
        return;
    }

    const MoodleToolkit = (function () {

        const State = {
            originalTitle: document.title,
            timerActive: false
        };

        const GraderModule = {
            moodleScoreMap: { '5': '1', '4': '2', '3': '3', '2': '4', '1': '5' },
            scoreIndexMap: { '5': 0, '4': 1, '3': 2, '2': 3, '1': 4 },

            execute() {
                const targetValue = document.getElementById('select-nota-toolkit')?.value || '5';
                let selectedCount = 0;
                const isMoodlePlatform = window.location.hostname.includes('virtual.unipiloto.edu.co');

                if (isMoodlePlatform) {
                    const realValue = this.moodleScoreMap[targetValue];
                    document.querySelectorAll(`input[type="radio"][value="${realValue}"]`).forEach(radio => {
                        if (radio.closest('.feedback-item-multichoice') || radio.closest('.form-check-inline')) {
                            if (!radio.checked) {
                                radio.checked = true;
                                radio.dispatchEvent(new Event('change', { bubbles: true }));
                                radio.click();
                                selectedCount++;
                            }
                        }
                    });
                } else {
                    const groups = {};
                    document.querySelectorAll('input[type="radio"]').forEach(radio => {
                        if (!groups[radio.name]) groups[radio.name] = [];
                        groups[radio.name].push(radio);
                    });

                    const targetIdx = this.scoreIndexMap[targetValue] ?? 0;
                    Object.values(groups).forEach(radiosInGroup => {
                        if (radiosInGroup.length >= 4) {
                            const radioToSelect = radiosInGroup[targetIdx] || radiosInGroup[0];
                            if (radioToSelect) {
                                radioToSelect.checked = true;
                                radioToSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                radioToSelect.dispatchEvent(new Event('click', { bubbles: true }));
                                selectedCount++;
                            }
                        } else {
                            const match = radiosInGroup.find(r => r.value.endsWith(`-${targetValue}`) || r.value === targetValue);
                            if (match) {
                                match.checked = true;
                                match.dispatchEvent(new Event('change', { bubbles: true }));
                                match.dispatchEvent(new Event('click', { bubbles: true }));
                                selectedCount++;
                            }
                        }
                    });
                }

                alert(`✅ ¡Listo! Se marcaron ${selectedCount} respuestas con la nota seleccionada.`);
                window.scrollTo(0, document.body.scrollHeight);
            }
        };

        const TimerModule = {
            isActive: false,
            intervalId: null,

            start() {
                if (this.isActive) {
                    alert('⚠️ El temporizador ya se encuentra en ejecución.');
                    return;
                }

                let detectedMinutes = 5;
                const regexMatch = document.body.innerText.match(/(?:dedicar al menos|established in|at least|minimum of|establecido en|menos|mínimo de)\s+(\d+)\s+(?:minutes|minutos)/i);
                if (regexMatch && regexMatch[1]) detectedMinutes = parseInt(regexMatch[1]);

                const totalMs = detectedMinutes * 60 * 1000;
                const targetEndTime = Date.now() + totalMs;
                let lastKeepAliveMinute = -1;

                this.isActive = true;
                State.timerActive = true;

                try {
                    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
                    Object.defineProperty(document, 'hidden', { value: false, writable: true });
                } catch (e) { /* noop */ }

                const timerDisplay = document.getElementById('toolkit-timer-display');
                const timerTextSpan = document.getElementById('toolkit-timer-text');
                const timerButton = document.getElementById('btn-tk-timer');

                if (timerDisplay) timerDisplay.style.display = 'block';
                if (timerButton) {
                    timerButton.classList.add('tk-btn-secondary');
                    timerButton.classList.remove('tk-btn-primary');
                    timerButton.innerText = '⏱️ Temporizador en Curso...';
                    timerButton.disabled = true;
                }

                const self = this;
                this.intervalId = setInterval(() => {
                    const now = Date.now();
                    const remainingMs = Math.max(0, targetEndTime - now);

                    const currentMinuteSlot = Math.floor((totalMs - remainingMs) / 60000);
                    if (currentMinuteSlot > lastKeepAliveMinute) {
                        lastKeepAliveMinute = currentMinuteSlot;
                        document.querySelectorAll('video, audio').forEach(m => {
                            m.muted = true;
                            m.volume = 0;
                            m.play().catch(() => { /* noop */ });
                        });
                        window.scrollBy(0, 10);
                        setTimeout(() => window.scrollBy(0, -10), 100);
                    }

                    const minutesLeft = Math.floor(remainingMs / 60000);
                    const secondsLeft = Math.floor((remainingMs % 60000) / 1000);
                    if (timerTextSpan) timerTextSpan.innerText = `${minutesLeft.toString().padStart(2, '0')}:${secondsLeft.toString().padStart(2, '0')}`;

                    if (remainingMs <= 0) {
                        clearInterval(self.intervalId);
                        self.isActive = false;
                        State.timerActive = false;
                        self.intervalId = null;
                        document.title = '🔴 ¡Finalizado! - ' + State.originalTitle;
                        if (timerButton) {
                            timerButton.classList.remove('tk-btn-secondary');
                            timerButton.classList.add('tk-btn-primary');
                            timerButton.innerText = '⏱️ Iniciar Temporizador';
                            timerButton.disabled = false;
                        }
                        if (timerDisplay) timerDisplay.style.display = 'none';
                        alert('⏱️ ¡El tiempo establecido ha finalizado con éxito!');
                    }
                }, 1000);

                alert(`⏱️ Temporizador e inyección anti-inactividad iniciados por ${detectedMinutes} minutos.`);
            }
        };

        const ScormModule = {
            findApi(win) {
                try {
                    if (!win) return null;
                    if (win.API) return win.API;
                    if (win.API_1484_11) return win.API_1484_11;
                    if (win.opener && !win.opener.closed) {
                        const foundOpener = this.findApi(win.opener);
                        if (foundOpener) return foundOpener;
                    }
                    if (win.frames && win.frames.length > 0) {
                        for (let i = 0; i < win.frames.length; i++) {
                            const found = this.findApi(win.frames[i]);
                            if (found) return found;
                        }
                    }
                    if (win.parent && win.parent !== win) return this.findApi(win.parent);
                    if (win.top && win.top !== win) return this.findApi(win.top);
                } catch (e) { /* noop */ }
                return null;
            },

            complete() {
                let scormApi = this.findApi(window);
                if (!scormApi) {
                    const iframes = document.querySelectorAll('iframe');
                    for (const iframe of iframes) {
                        try {
                            scormApi = this.findApi(iframe.contentWindow);
                            if (scormApi) break;
                        } catch (e) { /* noop */ }
                    }
                }

                if (scormApi) {
                    try {
                        if (typeof scormApi.LMSInitialize === 'function') scormApi.LMSInitialize('');
                        if (typeof scormApi.Initialize === 'function') scormApi.Initialize('');

                        if (typeof scormApi.LMSSetValue === 'function') {
                            scormApi.LMSSetValue('cmi.core.lesson_status', 'completed');
                            scormApi.LMSSetValue('cmi.core.score.raw', '100');
                        }
                        if (typeof scormApi.SetValue === 'function') {
                            scormApi.SetValue('cmi.completion_status', 'completed');
                            scormApi.SetValue('cmi.success_status', 'passed');
                            scormApi.SetValue('cmi.score.raw', '100');
                        }

                        if (typeof scormApi.LMSCommit === 'function') scormApi.LMSCommit('');
                        if (typeof scormApi.Commit === 'function') scormApi.Commit('');

                        setTimeout(() => {
                            if (typeof scormApi.LMSFinish === 'function') scormApi.LMSFinish('');
                            if (typeof scormApi.Terminate === 'function') scormApi.Terminate('');
                            alert('✅ ¡SCORM completado al 100%!');
                        }, 1000);
                    } catch (e) {
                        alert('❌ Error al ejecutar los comandos en la API SCORM.');
                    }
                } else {
                    alert('❌ No se detectó ninguna API SCORM activa.');
                }
            }
        };

        const StorageKeys = {
            ACTIVE: 'moodle_toolkit_auto_active',
            LAST_URL: 'moodle_toolkit_last_url'
        };

        const AutoAdvanceModule = {
            start() {
                localStorage.setItem(StorageKeys.ACTIVE, 'true');
                localStorage.setItem(StorageKeys.LAST_URL, window.location.href);
                this.triggerNext();
            },

            stop(showAlert = true) {
                localStorage.removeItem(StorageKeys.ACTIVE);
                localStorage.removeItem(StorageKeys.LAST_URL);
                if (showAlert) alert('🛑 Auto-avance detenido con éxito.');
            },

            triggerNext() {
                if (localStorage.getItem(StorageKeys.ACTIVE) !== 'true') return;

                setTimeout(() => {
                    const nextBtn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(el => {
                        if (el.disabled) return false;
                        const text = (el.innerText || el.value || '').trim().toLowerCase();
                        const form = el.closest('form');
                        const isLessonContinue = form && form.action && form.action.includes('mod/lesson/continue.php');
                        return isLessonContinue && (text === 'siguiente' || text === 'next' || text.includes('siguiente'));
                    });

                    if (nextBtn) {
                        localStorage.setItem(StorageKeys.LAST_URL, window.location.href);
                        console.log('⚡ Moodle Toolkit | Botón de Lección Siguiente detectado, avanzando...');
                        nextBtn.click();
                    } else {
                        this.stop(false);
                        alert('🎉 ¡Lección completada al 100%! Ya no hay más páginas.');
                    }
                }, 2500);
            }
        };

        const PageDetector = {
            detect() {
                const fullBodyText = document.body.innerText;
                const lowerBodyText = fullBodyText.toLowerCase();
                const currentUrl = window.location.href;

                const isMoodleQuiz = currentUrl.includes('/mod/quiz/');

                const isActivityCompleted = /hecho\s*:/i.test(fullBodyText) ||
                    lowerBodyText.includes('completado') ||
                    document.querySelector('.completion-icon, [title*="Hecho"], .badge-success') !== null;

                const hasScorm = !isMoodleQuiz && (
                    currentUrl.includes('/mod/scorm/') ||
                    currentUrl.includes('player.php') ||
                    (window.opener !== null && !currentUrl.includes('/mod/quiz/')) ||
                    document.querySelector('iframe[src*="scorm"], iframe[src*="genially"], #scorm_object') !== null
                );

                const isBanWebSurvey = window.location.hostname.includes('tierra.unipiloto.edu.co') && (
                    currentUrl.includes('bvsktess') ||
                    currentUrl.includes('DisplaySrvy') ||
                    document.querySelector('input[type="radio"]') !== null
                );

                const hasSurveys = !isMoodleQuiz && (
                    currentUrl.includes('/mod/feedback/') ||
                    currentUrl.includes('/mod/questionnaire/') ||
                    document.querySelector('.feedback-item-multichoice') !== null ||
                    isBanWebSurvey
                );

                const isLessonPage = currentUrl.includes('/mod/lesson/view.php') &&
                    document.querySelector('form[action*="mod/lesson/continue.php"] button, form[action*="mod/lesson/continue.php"] input[type="submit"]') !== null;

                const needsTimer = !isMoodleQuiz && !isActivityCompleted && (
                    lowerBodyText.includes('minuto') ||
                    lowerBodyText.includes('dedicar al menos') ||
                    document.querySelector('video, audio, iframe[src*="genially"], iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="player"]') !== null
                );

                return { needsTimer, hasScorm, hasSurveys, isLessonPage };
            }
        };

        const UiModule = {
            panelId: 'moodle-toolkit-panel',

            injectStyles() {
                if (document.getElementById('moodle-toolkit-styles')) return;
                const style = document.createElement('style');
                style.id = 'moodle-toolkit-styles';
                style.textContent = `
                    #moodle-toolkit-panel {
                        position: fixed; top: 16px; right: 16px; z-index: 999999;
                        width: 264px; background: #ffffff; color: #0f172a;
                        border: 1px solid #e2e8f0; border-radius: 12px;
                        padding: 16px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                        font-size: 13px; line-height: 1.5;
                        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10);
                    }
                    #moodle-toolkit-panel .tk-header {
                        display: flex; align-items: center; justify-content: space-between;
                        margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;
                    }
                    #moodle-toolkit-panel .tk-title {
                        font-weight: 600; font-size: 14px; color: #0f172a;
                        display: flex; align-items: center; gap: 6px;
                    }
                    #moodle-toolkit-panel .tk-close {
                        background: transparent; border: none; color: #64748b; cursor: pointer;
                        font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px;
                        transition: background .15s ease, color .15s ease;
                    }
                    #moodle-toolkit-panel .tk-close:hover { background: #f1f5f9; color: #0f172a; }
                    #moodle-toolkit-panel .tk-body { display: flex; flex-direction: column; gap: 8px; }
                    #moodle-toolkit-panel .tk-btn {
                        width: 100%; height: 36px; border: 1px solid transparent; border-radius: 8px;
                        font-size: 13px; font-weight: 500; cursor: pointer;
                        transition: all .15s ease; display: inline-flex; align-items: center;
                        justify-content: center; gap: 6px; font-family: inherit;
                    }
                    #moodle-toolkit-panel .tk-btn:disabled { opacity: .55; cursor: not-allowed; }
                    #moodle-toolkit-panel .tk-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(15,23,42,.2); }
                    #moodle-toolkit-panel .tk-btn-primary { background: #0f172a; color: #ffffff; }
                    #moodle-toolkit-panel .tk-btn-primary:hover:not(:disabled) { background: #1e293b; }
                    #moodle-toolkit-panel .tk-btn-secondary { background: #f1f5f9; color: #0f172a; }
                    #moodle-toolkit-panel .tk-btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
                    #moodle-toolkit-panel .tk-btn-destructive { background: #dc2626; color: #ffffff; }
                    #moodle-toolkit-panel .tk-btn-destructive:hover:not(:disabled) { background: #b91c1c; }
                    #moodle-toolkit-panel .tk-btn-outline { background: #ffffff; color: #0f172a; border-color: #e2e8f0; }
                    #moodle-toolkit-panel .tk-btn-outline:hover:not(:disabled) { background: #f8fafc; }
                    #moodle-toolkit-panel .tk-section { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 2px; }
                    #moodle-toolkit-panel .tk-label {
                        display: block; font-size: 11px; font-weight: 500; color: #64748b;
                        margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em;
                    }
                    #moodle-toolkit-panel .tk-row { display: flex; gap: 6px; align-items: stretch; }
                    #moodle-toolkit-panel .tk-select {
                        flex: 1; height: 36px; border: 1px solid #e2e8f0; border-radius: 8px;
                        padding: 0 10px; font-size: 13px; background: #ffffff; color: #0f172a;
                        outline: none; transition: border-color .15s ease, box-shadow .15s ease; font-family: inherit;
                    }
                    #moodle-toolkit-panel .tk-select:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,.15); }
                    #moodle-toolkit-panel .tk-timer {
                        display: none; background: #f0fdf4; color: #166534; text-align: center;
                        padding: 8px; border-radius: 8px; font-weight: 600; font-size: 13px;
                        border: 1px solid #bbf7d0;
                    }
                    #moodle-toolkit-panel .tk-timer span { font-variant-numeric: tabular-nums; }
                `;
                document.head.appendChild(style);
            },

            render(flags) {
                if (document.getElementById(this.panelId)) return;
                const isMoodleOrBanWeb = window.location.hostname.includes('unipiloto.edu.co');
                if (!isMoodleOrBanWeb) return;

                if (!flags.isLessonPage && !flags.needsTimer && !flags.hasScorm && !flags.hasSurveys) return;

                this.injectStyles();

                const isAutoRunning = localStorage.getItem(StorageKeys.ACTIVE) === 'true';

                const panel = document.createElement('div');
                panel.id = this.panelId;

                let html = `
                    <div class="tk-header">
                        <span class="tk-title">⚙️ Moodle Toolkit</span>
                        <button class="tk-close" id="close-toolkit-panel" aria-label="Cerrar">✕</button>
                    </div>
                    <div class="tk-body">`;

                if (flags.isLessonPage) {
                    html += `
                        <button id="btn-tk-autosafe" class="tk-btn ${isAutoRunning ? 'tk-btn-secondary' : 'tk-btn-primary'}" ${isAutoRunning ? 'disabled' : ''}>
                            ${isAutoRunning ? '⏳ Avanzando Solo...' : '⚡ Auto-Avanzar (Lección)'}
                        </button>
                        <button id="btn-tk-stop" class="tk-btn tk-btn-destructive">🛑 Detener Avance</button>`;
                }

                if (flags.needsTimer) {
                    html += `
                        <button id="btn-tk-timer" class="tk-btn tk-btn-primary">⏱️ Iniciar Temporizador</button>
                        <div id="toolkit-timer-display" class="tk-timer">⏳ Restante: <span id="toolkit-timer-text">00:00</span></div>`;
                }

                if (flags.hasScorm) {
                    html += `
                        <button id="btn-tk-scorm" class="tk-btn tk-btn-primary">🚀 Completar SCORM</button>`;
                }

                if (flags.hasSurveys) {
                    html += `
                        <div class="tk-section">
                            <label class="tk-label" for="select-nota-toolkit">Calificar encuesta</label>
                            <div class="tk-row">
                                <select id="select-nota-toolkit" class="tk-select">
                                    <option value="5" selected>5 (Excelente)</option>
                                    <option value="4">4</option>
                                    <option value="3">3</option>
                                    <option value="2">2</option>
                                    <option value="1">1</option>
                                </select>
                                <button id="btn-tk-grade" class="tk-btn tk-btn-primary" style="width:auto;padding:0 14px;">Aplicar</button>
                            </div>
                        </div>`;
                }

                html += `</div>`;
                panel.innerHTML = html;
                document.body.appendChild(panel);

                this.bindEvents();
            },

            bindEvents() {
                const autoSafeBtn = document.getElementById('btn-tk-autosafe');
                if (autoSafeBtn) {
                    autoSafeBtn.onclick = () => {
                        AutoAdvanceModule.start();
                        autoSafeBtn.classList.remove('tk-btn-primary');
                        autoSafeBtn.classList.add('tk-btn-secondary');
                        autoSafeBtn.innerText = '⏳ Avanzando Solo...';
                        autoSafeBtn.disabled = true;
                    };
                }

                const stopBtn = document.getElementById('btn-tk-stop');
                if (stopBtn) stopBtn.onclick = () => AutoAdvanceModule.stop(true);

                const timerBtn = document.getElementById('btn-tk-timer');
                if (timerBtn) timerBtn.onclick = () => TimerModule.start();

                const scormBtn = document.getElementById('btn-tk-scorm');
                if (scormBtn) scormBtn.onclick = () => ScormModule.complete();

                const gradeBtn = document.getElementById('btn-tk-grade');
                if (gradeBtn) gradeBtn.onclick = () => GraderModule.execute();

                const closeBtn = document.getElementById('close-toolkit-panel');
                if (closeBtn) closeBtn.onclick = () => document.getElementById(this.panelId)?.remove();
            }
        };

        function init() {
            window.addEventListener('beforeunload', (event) => {
                if (State.timerActive) {
                    event.preventDefault();
                    event.returnValue = '';
                }
            });

            window.addEventListener('load', () => {
                if (localStorage.getItem(StorageKeys.ACTIVE) === 'true') {
                    AutoAdvanceModule.triggerNext();
                }
            });

            const run = () => UiModule.render(PageDetector.detect());
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                run();
            } else {
                window.addEventListener('load', run);
            }
        }

        return { init, State, AutoAdvanceModule };
    })();

    MoodleToolkit.init();
})();
