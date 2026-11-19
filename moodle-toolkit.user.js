// ==UserScript==
// @name        Moodle Toolkit (Encuestas / Moodle / SCORM / Quiz)
// @namespace   http://tampermonkey.net/
// @version     6.0
// @description Herramientas inteligentes y adaptativas para Moodle (Virtual) y BanWeb (Tierra): Encuestas, SCORM, Auto-avance y Asistente de Quizzes/Exámenes.
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

    // --- Guardia de sesión: redirige a login cuando no hay sesión o se cae en ?redirect=0 ---
    const SessionGuard = {
        loginUrl: 'https://virtual.unipiloto.edu.co/login/index.php',
        isMoodle() { return window.location.hostname.includes('virtual.unipiloto.edu.co'); },
        isLoginPage() { return window.location.pathname.includes('/login/index.php'); },
        redirect() {
            if (this.isLoginPage()) return;
            try { window.location.replace(this.loginUrl); } catch (e) { window.location.href = this.loginUrl; }
        },
        hasRedirectZero() {
            if (!this.isMoodle() || this.isLoginPage()) return false;
            const path = window.location.pathname.replace(/\/+$/, '') || '/';
            const qs = window.location.search;
            return (path === '' || path === '/') && /[?&]redirect=0(?:&|$)/.test(qs);
        },
        isLoggedIn() {
            // Indicadores de usuario autenticado en la página
            return document.querySelector('.usermenu, #usernavigation, a[href*="/user/profile.php"], [data-userid], .usr-picture, .logininfo a[href*="logout"]') !== null;
        },
        checkSession() {
            if (!this.isMoodle() || this.isLoginPage()) return false;
            const bodyText = (document.body && document.body.innerText) ? document.body.innerText.toLowerCase() : '';
            const noSessionMarkers = [
                'no ha iniciado sesión', 'you are not logged in', 'not logged in',
                'sesión expirada', 'session expired', 'session timed out', 'sesión ha expirado',
                'debe iniciar sesión', 'you must be logged', 'login required',
                'no está usted autenticado', 'not authenticated',
                'usted no ha iniciado sesión'
            ];
            if (noSessionMarkers.some(m => bodyText.includes(m))) return true;
            // Si estamos en redirect=0 y no hay menú de usuario (o hay enlace de login), no hay sesión
            if (this.hasRedirectZero()) {
                const hasLoginLink = /login/i.test(document.body?.innerText || '') &&
                    (document.querySelector('a[href*="/login/"], button[data-action="login"]') !== null);
                if (!this.isLoggedIn() || hasLoginLink) return true;
            }
            return false;
        },
        run() {
            if (!this.isMoodle()) return;
            const doCheck = () => {
                if (this.checkSession()) this.redirect();
            };
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(doCheck, 300);
            } else {
                window.addEventListener('load', () => setTimeout(doCheck, 300));
            }
        }
    };
    SessionGuard.run();

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
                    timerButton.innerHTML = `${UiModule.Icons.loader} Temporizador en Curso...`;
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
                            timerButton.innerHTML = `${UiModule.Icons.clock} Iniciar Temporizador`;
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

        const QuizModule = {
            storagePrefix: 'moodle_quiz_memory_',
            globalIndexKey: 'moodle_quiz_global_index',

            getQuizId() {
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('cmid')) return urlParams.get('cmid');

                const viewLink = document.querySelector('a[href*="/mod/quiz/view.php?id="]');
                if (viewLink) {
                    const m = viewLink.href.match(/[?&]id=(\d+)/);
                    if (m) return m[1];
                }

                const cmidClass = document.body?.className.match(/cmid-(\d+)/);
                if (cmidClass && cmidClass[1]) return cmidClass[1];

                const cmidInput = document.querySelector('input[name="cmid"]');
                if (cmidInput && cmidInput.value) return cmidInput.value;

                const h1Text = document.querySelector('h1, h2, .page-header-headings')?.innerText?.trim();
                if (h1Text) return this.normalizeText(h1Text).substring(0, 40);

                return 'default_quiz';
            },

            normalizeText(str) {
                if (!str) return '';
                return str
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
            },

            cleanQuestionKey(qEl) {
                const qtext = qEl.querySelector('.qtext');
                if (!qtext) return '';
                const clone = qtext.cloneNode(true);
                clone.querySelectorAll('.accesshide, .sr-only, script, style').forEach(el => el.remove());
                clone.querySelectorAll('img').forEach(img => {
                    const alt = img.getAttribute('alt') || img.src.split('/').pop().split('?')[0];
                    const span = document.createElement('span');
                    span.textContent = ` [img:${alt}] `;
                    img.replaceWith(span);
                });
                let raw = clone.innerText || clone.textContent || '';
                raw = raw.replace(/^pregunta\s*\d+\s*[:.-]?\s*/i, '').replace(/^\d+[\s.)-]+\s*/, '');
                return this.normalizeText(raw);
            },

            cleanOptionText(optEl) {
                if (!optEl) return '';
                const clone = optEl.cloneNode(true);
                clone.querySelectorAll('input, .answernumber, .icon, .feedback, .sr-only, .accesshide, .tk-badge-wrong, .tk-badge-correct, script, style').forEach(el => el.remove());
                let raw = clone.innerText || clone.textContent || '';
                raw = raw.replace(/^[a-e0-9][.)\-]\s*/i, '');
                return this.normalizeText(raw);
            },

            parseRightAnswers(rightAnswerEl) {
                if (!rightAnswerEl) return [];
                let raw = rightAnswerEl.innerText || rightAnswerEl.textContent || '';
                raw = raw.replace(/^(?:la respuesta correcta es|las respuestas correctas son|the correct answer is|the correct answers are|respuesta correcta)\s*:\s*/i, '').trim();
                raw = raw.replace(/^['"«“](.*)['"»”]$/, '$1').trim();
                if (!raw) return [];
                const norm = this.cleanOptionText(rightAnswerEl);
                return norm ? [norm] : [];
            },

            isQuestionCorrect(qEl) {
                if (qEl.classList.contains('correct')) return true;
                if (qEl.classList.contains('incorrect')) return false;

                const stateText = (qEl.querySelector('.info .state')?.innerText || '').toLowerCase();
                if (stateText.includes('correcta') || stateText.includes('correct')) return true;
                if (stateText.includes('incorrecta') || stateText.includes('incorrect')) return false;

                const gradeText = qEl.querySelector('.info .grade')?.innerText || '';
                const m = gradeText.match(/([\d.,]+)\s*(?:sobre|out of|\/)\s*([\d.,]+)/i);
                if (m) {
                    const pts = parseFloat(m[1].replace(',', '.'));
                    const max = parseFloat(m[2].replace(',', '.'));
                    if (max > 0) {
                        if (pts >= max) return true;
                        if (pts === 0) return false;
                    }
                }
                return null;
            },

            getQuizData(quizId) {
                const key = `${this.storagePrefix}${quizId}`;
                try {
                    return JSON.parse(localStorage.getItem(key) || '{}');
                } catch (e) {
                    return {};
                }
            },

            saveQuizData(quizId, questionResults) {
                const storageKey = `${this.storagePrefix}${quizId}`;
                let data = this.getQuizData(quizId);
                if (!data.questions) data.questions = {};
                data.lastUpdated = Date.now();
                data.quizId = quizId;

                questionResults.forEach(res => {
                    if (!res || !res.key) return;
                    if (!data.questions[res.key]) {
                        data.questions[res.key] = { correct: [], incorrect: [] };
                    }
                    const qRecord = data.questions[res.key];

                    res.correct.forEach(c => {
                        if (!qRecord.correct.includes(c)) {
                            qRecord.correct.push(c);
                        }
                        const idx = qRecord.incorrect.indexOf(c);
                        if (idx !== -1) qRecord.incorrect.splice(idx, 1);
                    });

                    res.incorrect.forEach(inc => {
                        if (!qRecord.incorrect.includes(inc) && !qRecord.correct.includes(inc)) {
                            qRecord.incorrect.push(inc);
                        }
                    });
                });

                localStorage.setItem(storageKey, JSON.stringify(data));
                this.updateGlobalIndex(questionResults);
                return data;
            },

            updateGlobalIndex(questionResults) {
                try {
                    let globalData = JSON.parse(localStorage.getItem(this.globalIndexKey) || '{}');
                    questionResults.forEach(res => {
                        if (!res || !res.key) return;
                        if (!globalData[res.key]) globalData[res.key] = { correct: [], incorrect: [] };
                        const g = globalData[res.key];
                        res.correct.forEach(c => {
                            if (!g.correct.includes(c)) g.correct.push(c);
                            const idx = g.incorrect.indexOf(c);
                            if (idx !== -1) g.incorrect.splice(idx, 1);
                        });
                        res.incorrect.forEach(inc => {
                            if (!g.incorrect.includes(inc) && !g.correct.includes(inc)) {
                                g.incorrect.push(inc);
                            }
                        });
                    });
                    localStorage.setItem(this.globalIndexKey, JSON.stringify(globalData));
                } catch (e) { /* noop */ }
            },

            findQuestionRecord(qKey, currentQuizData) {
                if (currentQuizData?.questions?.[qKey]) {
                    return currentQuizData.questions[qKey];
                }
                if (currentQuizData?.questions) {
                    for (const [key, val] of Object.entries(currentQuizData.questions)) {
                        if (this.matchText(qKey, key)) return val;
                    }
                }
                try {
                    const globalData = JSON.parse(localStorage.getItem(this.globalIndexKey) || '{}');
                    if (globalData[qKey]) return globalData[qKey];
                    for (const [key, val] of Object.entries(globalData)) {
                        if (this.matchText(qKey, key)) return val;
                    }
                } catch (e) { /* noop */ }
                return null;
            },

            matchText(a, b) {
                if (!a || !b) return false;
                if (a === b) return true;
                if (a.length > 15 && b.length > 15) {
                    if (a.includes(b) || b.includes(a)) return true;
                }
                return false;
            },

            matchOption(optText, targetText) {
                if (!optText || !targetText) return false;
                if (optText === targetText) return true;
                if (optText.length > 8 && targetText.length > 8) {
                    if (optText.includes(targetText) || targetText.includes(optText)) return true;
                }
                return false;
            },

            scanReviewPage() {
                const quizId = this.getQuizId();
                const questionEls = document.querySelectorAll('.que');
                if (questionEls.length === 0) return { correctCount: 0, incorrectCount: 0 };

                const results = [];
                let totalCorrect = 0;
                let totalIncorrect = 0;

                questionEls.forEach(qEl => {
                    const qKey = this.cleanQuestionKey(qEl);
                    if (!qKey) return;

                    const isCorrect = this.isQuestionCorrect(qEl);
                    const rightAnswerEl = qEl.querySelector('.rightanswer');
                    const revealedRightAnswers = this.parseRightAnswers(rightAnswerEl);

                    const correctList = new Set();
                    const incorrectList = new Set();

                    revealedRightAnswers.forEach(ans => correctList.add(ans));

                    const inputs = Array.from(qEl.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]'));
                    inputs.forEach(input => {
                        const row = input.closest('div[class*="r"], .form-check, li, tr') || input.parentElement;
                        const optText = this.cleanOptionText(row || input.parentElement);
                        if (!optText) return;

                        const isChecked = input.checked || input.hasAttribute('checked');
                        const hasCheckIcon = row.querySelector('.fa-check, .text-success, .correct') !== null || row.classList.contains('correct');
                        const hasCrossIcon = row.querySelector('.fa-remove, .fa-times, .text-danger, .incorrect') !== null || row.classList.contains('incorrect');

                        if (hasCheckIcon) {
                            correctList.add(optText);
                            this.markReviewOptionUI(row, 'correct');
                        } else if (hasCrossIcon) {
                            incorrectList.add(optText);
                            this.markReviewOptionUI(row, 'incorrect');
                        } else if (isChecked) {
                            if (isCorrect === true) {
                                correctList.add(optText);
                                this.markReviewOptionUI(row, 'correct');
                            } else if (isCorrect === false) {
                                incorrectList.add(optText);
                                this.markReviewOptionUI(row, 'incorrect');
                            }
                        }
                    });

                    // Short answer questions
                    const textInput = qEl.querySelector('.que.shortanswer input[type="text"], .answer input[type="text"]');
                    if (textInput) {
                        const val = this.normalizeText(textInput.value || '');
                        if (val) {
                            if (isCorrect === true) correctList.add(val);
                            else if (isCorrect === false) incorrectList.add(val);
                        }
                    }

                    totalCorrect += correctList.size;
                    totalIncorrect += incorrectList.size;

                    results.push({
                        key: qKey,
                        correct: Array.from(correctList),
                        incorrect: Array.from(incorrectList)
                    });
                });

                const savedData = this.saveQuizData(quizId, results);
                this.updatePanelReviewStats(savedData);
                return { correctCount: totalCorrect, incorrectCount: totalIncorrect };
            },

            markReviewOptionUI(row, type) {
                if (!row || row.dataset.tkReviewMarked) return;
                row.dataset.tkReviewMarked = 'true';
                const label = row.querySelector('label') || row;
                if (type === 'correct') {
                    if (!row.querySelector('.tk-badge-review-correct')) {
                        const badge = document.createElement('span');
                        badge.className = 'tk-badge-review-correct';
                        badge.innerHTML = '💾 Guardada (correcta)';
                        badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:8px; display:inline-flex; align-items:center; gap:4px; vertical-align:middle;';
                        label.appendChild(badge);
                    }
                } else if (type === 'incorrect') {
                    if (!row.querySelector('.tk-badge-review-incorrect')) {
                        const badge = document.createElement('span');
                        badge.className = 'tk-badge-review-incorrect';
                        badge.innerHTML = '💾 Guardada (para tachar)';
                        badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:8px; display:inline-flex; align-items:center; gap:4px; vertical-align:middle;';
                        label.appendChild(badge);
                    }
                }
            },

            applyAttemptAnswers() {
                const quizId = this.getQuizId();
                const data = this.getQuizData(quizId);
                const questionEls = document.querySelectorAll('.que');
                if (questionEls.length === 0) return { filledCount: 0, struckCount: 0 };

                let filledCount = 0;
                let struckCount = 0;

                questionEls.forEach(qEl => {
                    const qKey = this.cleanQuestionKey(qEl);
                    if (!qKey) return;

                    const record = this.findQuestionRecord(qKey, data);
                    if (!record) return;

                    const { correct = [], incorrect = [] } = record;

                    const inputs = Array.from(qEl.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]'));
                    inputs.forEach(input => {
                        const row = input.closest('div[class*="r"], .form-check, li, tr') || input.parentElement;
                        const optText = this.cleanOptionText(row || input.parentElement);
                        if (!optText) return;

                        // 1. Is this option known to be INCORRECT?
                        const isWrong = incorrect.some(inc => this.matchOption(optText, inc));
                        if (isWrong) {
                            this.markOptionIncorrect(row, input);
                            struckCount++;
                        }

                        // 2. Is this option known to be CORRECT?
                        const isCorrect = correct.some(c => this.matchOption(optText, c));
                        if (isCorrect) {
                            this.markOptionCorrectAndSelect(row, input);
                            filledCount++;
                        }
                    });

                    // Short answer
                    const textInput = qEl.querySelector('.que.shortanswer input[type="text"], .answer input[type="text"]');
                    if (textInput && correct.length > 0) {
                        if (!textInput.value) {
                            textInput.value = correct[0];
                            textInput.dispatchEvent(new Event('input', { bubbles: true }));
                            textInput.dispatchEvent(new Event('change', { bubbles: true }));
                            textInput.style.backgroundColor = '#f0fdf4';
                            textInput.style.borderColor = '#22c55e';
                            filledCount++;
                        }
                    }
                });

                this.updatePanelAttemptStats(filledCount, struckCount);
                return { filledCount, struckCount };
            },

            markOptionIncorrect(row, input) {
                if (!row) return;
                if (row.dataset.tkMarkedIncorrect) return;
                row.dataset.tkMarkedIncorrect = 'true';

                const label = row.querySelector('label') || row;
                label.style.textDecoration = 'line-through 2px #dc2626';
                label.style.color = '#991b1b';
                label.style.opacity = '0.65';
                row.style.background = 'rgba(254, 226, 226, 0.4)';
                row.style.borderRadius = '6px';
                row.style.padding = '2px 6px';
                row.style.transition = 'all 0.2s ease';

                if (input && input.checked) {
                    input.checked = false;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }

                if (!row.querySelector('.tk-badge-wrong')) {
                    const badge = document.createElement('span');
                    badge.className = 'tk-badge-wrong';
                    badge.innerHTML = '❌ <b>Incorrecta</b> (intento previo)';
                    badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:8px; display:inline-flex; align-items:center; gap:4px; text-decoration:none; vertical-align:middle;';
                    label.appendChild(badge);
                }

                if (input) {
                    input.addEventListener('click', (e) => {
                        const confirmed = window.confirm('⚠️ ATENCIÓN: Marcaste esta respuesta en el intento anterior y quedó INCORRECTA.\n\n¿Estás seguro de que deseas seleccionarla de nuevo?');
                        if (!confirmed) {
                            e.preventDefault();
                            input.checked = false;
                        }
                    });
                }
            },

            markOptionCorrectAndSelect(row, input) {
                if (!row || !input) return;
                if (row.dataset.tkMarkedCorrect) return;
                row.dataset.tkMarkedCorrect = 'true';

                if (!input.checked) {
                    input.checked = true;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('click', { bubbles: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                const label = row.querySelector('label') || row;
                label.style.fontWeight = '600';
                label.style.color = '#15803d';
                row.style.background = '#f0fdf4';
                row.style.border = '1px solid #86efac';
                row.style.borderRadius = '6px';
                row.style.padding = '2px 6px';
                row.style.transition = 'all 0.2s ease';

                if (!row.querySelector('.tk-badge-correct')) {
                    const badge = document.createElement('span');
                    badge.className = 'tk-badge-correct';
                    badge.innerHTML = '✅ <b>Correcta</b> (prellenada)';
                    badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:8px; display:inline-flex; align-items:center; gap:4px; vertical-align:middle;';
                    label.appendChild(badge);
                }
            },

            clearQuizData() {
                const quizId = this.getQuizId();
                localStorage.removeItem(`${this.storagePrefix}${quizId}`);
                alert('🗑️ Memoria de respuestas para este quiz eliminada con éxito.');
                window.location.reload();
            },

            getQuizStats() {
                const quizId = this.getQuizId();
                const data = this.getQuizData(quizId);
                let correctCount = 0;
                let incorrectCount = 0;
                let questionCount = 0;
                if (data && data.questions) {
                    questionCount = Object.keys(data.questions).length;
                    Object.values(data.questions).forEach(q => {
                        correctCount += (q.correct || []).length;
                        incorrectCount += (q.incorrect || []).length;
                    });
                }
                return { questionCount, correctCount, incorrectCount };
            },

            updatePanelReviewStats(data) {
                const statEl = document.getElementById('tk-quiz-review-stats');
                if (!statEl) return;
                const stats = this.getQuizStats();
                statEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span>📝 <b>${stats.questionCount}</b> preguntas registradas</span>
                        <span style="color:#15803d;">✅ <b>${stats.correctCount}</b> respuestas correctas guardadas</span>
                        <span style="color:#b91c1c;">❌ <b>${stats.incorrectCount}</b> opciones incorrectas guardadas</span>
                    </div>
                `;
            },

            updatePanelAttemptStats(filledCount, struckCount) {
                const statEl = document.getElementById('tk-quiz-attempt-stats');
                if (!statEl) return;
                statEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="color:#15803d;">✅ <b>${filledCount}</b> respuestas prellenadas</span>
                        <span style="color:#b91c1c;">❌ <b>${struckCount}</b> opciones incorrectas tachadas</span>
                    </div>
                `;
            }
        };

        const PageDetector = {
            detect() {
                const fullBodyText = document.body.innerText;
                const lowerBodyText = fullBodyText.toLowerCase();
                const currentUrl = window.location.href;

                const isQuizReview = currentUrl.includes('/mod/quiz/review.php');
                const isQuizAttempt = currentUrl.includes('/mod/quiz/attempt.php') || currentUrl.includes('/mod/quiz/processattempt.php');
                const isQuizView = currentUrl.includes('/mod/quiz/view.php');
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

                const timerRegex = /(?:dedicar al menos|established in|at least|minimum of|establecido en|menos|mínimo de)\s+(\d+)\s+(?:minutes|minutos)/i;
                const hasExplicitTimeRequirement = timerRegex.test(fullBodyText);

                const needsTimer = !isMoodleQuiz && !isActivityCompleted && hasExplicitTimeRequirement;

                return {
                    needsTimer,
                    hasScorm,
                    hasSurveys,
                    isLessonPage,
                    isQuizReview,
                    isQuizAttempt,
                    isQuizView,
                    isMoodleQuiz
                };
            }
        };

        const UiModule = {
            panelId: 'moodle-toolkit-panel',

            Icons: {
                settings: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
                zap: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
                loader: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
                stop: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>',
                clock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
                rocket: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
                x: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
                minimize: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
                brain: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/></svg>',
                refresh: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
                trash: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            },

            injectStyles() {
                if (document.getElementById('moodle-toolkit-styles')) return;
                const style = document.createElement('style');
                style.id = 'moodle-toolkit-styles';
                style.textContent = `
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
                    #moodle-toolkit-panel {
                        position: fixed; top: 16px; right: 16px; z-index: 999999;
                        width: 264px; background: #ffffff; color: #0f172a;
                        border: 1px solid #e2e8f0; border-radius: 12px;
                        padding: 16px; font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
                    #moodle-toolkit-panel .tk-header-actions { display: flex; gap: 4px; }
                    #moodle-toolkit-panel.tk-minimized .tk-body { display: none; }
                    .tk-badge-correct { background: #dcfce7 !important; color: #15803d !important; }
                    .tk-badge-wrong { background: #fee2e2 !important; color: #b91c1c !important; }
                    @media (prefers-color-scheme: dark) {
                        #moodle-toolkit-panel { background: #0f172a; color: #f8fafc; border-color: #334155; box-shadow: 0 10px 15px -3px rgba(0,0,0,.4); }
                        #moodle-toolkit-panel .tk-header { border-bottom-color: #334155; }
                        #moodle-toolkit-panel .tk-title { color: #f8fafc; }
                        #moodle-toolkit-panel .tk-close { color: #94a3b8; }
                        #moodle-toolkit-panel .tk-close:hover { background: #1e293b; color: #f8fafc; }
                        #moodle-toolkit-panel .tk-btn-primary { background: #f8fafc; color: #0f172a; }
                        #moodle-toolkit-panel .tk-btn-primary:hover:not(:disabled) { background: #e2e8f0; }
                        #moodle-toolkit-panel .tk-btn-secondary { background: #1e293b; color: #f8fafc; }
                        #moodle-toolkit-panel .tk-btn-secondary:hover:not(:disabled) { background: #334155; }
                        #moodle-toolkit-panel .tk-btn-outline { background: #0f172a; color: #f8fafc; border-color: #334155; }
                        #moodle-toolkit-panel .tk-select { background: #0f172a; color: #f8fafc; border-color: #334155; }
                        #moodle-toolkit-panel .tk-timer { background: #052e16; color: #86efac; border-color: #166534; }
                        #moodle-toolkit-panel .tk-section { border-top-color: #334155; }
                        #moodle-toolkit-panel .tk-label { color: #94a3b8; }
                        .tk-badge-correct { background: #052e16 !important; color: #86efac !important; }
                        .tk-badge-wrong { background: #450a0a !important; color: #fca5a5 !important; }
                        #tk-quiz-review-stats, #tk-quiz-attempt-stats, #tk-quiz-view-stats { color: #94a3b8 !important; }
                    }
                `;
                document.head.appendChild(style);
            },

            render(flags) {
                if (document.getElementById(this.panelId)) return;
                const isMoodleOrBanWeb = window.location.hostname.includes('unipiloto.edu.co');
                if (!isMoodleOrBanWeb) return;

                if (!flags.isLessonPage && !flags.needsTimer && !flags.hasScorm && !flags.hasSurveys && !flags.isQuizReview && !flags.isQuizAttempt && !flags.isQuizView) return;

                this.injectStyles();

                const isAutoRunning = localStorage.getItem(StorageKeys.ACTIVE) === 'true';

                const panel = document.createElement('div');
                panel.id = this.panelId;

                let html = `
                    <div class="tk-header">
                        <span class="tk-title">${this.Icons.settings} Moodle Toolkit</span>
                        <div class="tk-header-actions">
                            <button class="tk-close" id="minimize-toolkit-panel" aria-label="Minimizar">${this.Icons.minimize || '–'}</button>
                            <button class="tk-close" id="close-toolkit-panel" aria-label="Cerrar">${this.Icons.x}</button>
                        </div>
                    </div>
                    <div class="tk-body">`;

                if (flags.isQuizReview) {
                    html += `
                        <div class="tk-section" style="border-top:none; padding-top:0;">
                            <label class="tk-label">${this.Icons.brain} Asistente de Quiz (Revisión)</label>
                            <div id="tk-quiz-review-stats" style="font-size:12px; color:#475569; margin-bottom:8px; line-height:1.4;">
                                Analizando respuestas de la revisión...
                            </div>
                            <div class="tk-row" style="margin-bottom:6px;">
                                <button id="btn-tk-quiz-rescan" class="tk-btn tk-btn-primary" style="flex:1;">
                                    ${this.Icons.refresh} Re-escanear
                                </button>
                            </div>
                            <button id="btn-tk-quiz-clear" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px;">
                                ${this.Icons.trash} Limpiar memoria
                            </button>
                        </div>`;
                }

                if (flags.isQuizAttempt) {
                    html += `
                        <div class="tk-section" style="border-top:none; padding-top:0;">
                            <label class="tk-label">${this.Icons.brain} Asistente de Quiz (Intento)</label>
                            <div id="tk-quiz-attempt-stats" style="font-size:12px; color:#475569; margin-bottom:8px; line-height:1.4;">
                                Cargando respuestas memorizadas...
                            </div>
                            <div class="tk-row" style="margin-bottom:6px;">
                                <button id="btn-tk-quiz-apply" class="tk-btn tk-btn-primary" style="flex:1;">
                                    ${this.Icons.zap} Re-aplicar Respuestas
                                </button>
                            </div>
                            <button id="btn-tk-quiz-clear" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px;">
                                ${this.Icons.trash} Limpiar memoria
                            </button>
                        </div>`;
                }

                if (flags.isQuizView && !flags.isQuizReview && !flags.isQuizAttempt) {
                    html += `
                        <div class="tk-section" style="border-top:none; padding-top:0;">
                            <label class="tk-label">${this.Icons.brain} Asistente de Quiz</label>
                            <div id="tk-quiz-view-stats" style="font-size:12px; color:#475569; margin-bottom:8px; line-height:1.4;">
                                Memoria activa para este examen.
                            </div>
                            <button id="btn-tk-quiz-clear" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px;">
                                ${this.Icons.trash} Limpiar memoria
                            </button>
                        </div>`;
                }

                if (flags.isLessonPage) {
                    html += `
                        <button id="btn-tk-autosafe" class="tk-btn ${isAutoRunning ? 'tk-btn-secondary' : 'tk-btn-primary'}" ${isAutoRunning ? 'disabled' : ''}>
                            ${isAutoRunning ? `${this.Icons.loader} Avanzando Solo...` : `${this.Icons.zap} Auto-Avanzar (Lección)`}
                        </button>
                        <button id="btn-tk-stop" class="tk-btn tk-btn-destructive">${this.Icons.stop} Detener Avance</button>`;
                }

                if (flags.needsTimer) {
                    html += `
                        <button id="btn-tk-timer" class="tk-btn tk-btn-primary">${this.Icons.clock} Iniciar Temporizador</button>
                        <div id="toolkit-timer-display" class="tk-timer">${this.Icons.clock} Restante: <span id="toolkit-timer-text">00:00</span></div>`;
                }

                if (flags.hasScorm) {
                    html += `
                        <button id="btn-tk-scorm" class="tk-btn tk-btn-primary">${this.Icons.rocket} Completar SCORM</button>`;
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
                if (localStorage.getItem('moodle_toolkit_minimized') === 'true') {
                    panel.classList.add('tk-minimized');
                }
                try {
                    const savedPos = JSON.parse(localStorage.getItem('moodle_toolkit_pos') || 'null');
                    if (savedPos && savedPos.left && savedPos.top) {
                        panel.style.left = savedPos.left;
                        panel.style.top = savedPos.top;
                        panel.style.right = 'auto';
                    }
                } catch (e) { /* noop */ }
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
                        autoSafeBtn.innerHTML = `${UiModule.Icons.loader} Avanzando Solo...`;
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

                const rescanBtn = document.getElementById('btn-tk-quiz-rescan');
                if (rescanBtn) {
                    rescanBtn.onclick = () => {
                        const res = QuizModule.scanReviewPage();
                        alert(`🧠 Revisión analizada:\n- ${res.correctCount} respuestas correctas guardadas\n- ${res.incorrectCount} opciones incorrectas registradas`);
                    };
                }

                const applyBtn = document.getElementById('btn-tk-quiz-apply');
                if (applyBtn) {
                    applyBtn.onclick = () => {
                        const res = QuizModule.applyAttemptAnswers();
                        alert(`⚡ Respuestas aplicadas:\n- ${res.filledCount} correctas prellenadas\n- ${res.struckCount} incorrectas tachadas`);
                    };
                }

                const clearQuizBtn = document.getElementById('btn-tk-quiz-clear');
                if (clearQuizBtn) {
                    clearQuizBtn.onclick = () => {
                        if (confirm('¿Deseas borrar la memoria de respuestas para este examen?')) {
                            QuizModule.clearQuizData();
                        }
                    };
                }

                const closeBtn = document.getElementById('close-toolkit-panel');
                if (closeBtn) closeBtn.onclick = () => document.getElementById(this.panelId)?.remove();

                const panel = document.getElementById(this.panelId);
                const header = panel?.querySelector('.tk-header');
                if (panel && header) {
                    let dragging = false;
                    let offsetX = 0;
                    let offsetY = 0;
                    header.addEventListener('mousedown', (e) => {
                        if (e.target.closest('button')) return;
                        dragging = true;
                        const rect = panel.getBoundingClientRect();
                        offsetX = e.clientX - rect.left;
                        offsetY = e.clientY - rect.top;
                        panel.style.right = 'auto';
                        e.preventDefault();
                    });
                    document.addEventListener('mousemove', (e) => {
                        if (!dragging) return;
                        panel.style.left = `${e.clientX - offsetX}px`;
                        panel.style.top = `${e.clientY - offsetY}px`;
                    });
                    document.addEventListener('mouseup', () => {
                        if (!dragging) return;
                        dragging = false;
                        localStorage.setItem('moodle_toolkit_pos', JSON.stringify({ left: panel.style.left, top: panel.style.top }));
                    });
                }

                const minimizeBtn = document.getElementById('minimize-toolkit-panel');
                if (minimizeBtn) {
                    minimizeBtn.onclick = () => {
                        const panel = document.getElementById(this.panelId);
                        if (!panel) return;
                        const minimized = panel.classList.toggle('tk-minimized');
                        localStorage.setItem('moodle_toolkit_minimized', minimized ? 'true' : 'false');
                    };
                }
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

            const run = () => {
                const flags = PageDetector.detect();
                UiModule.render(flags);

                if (flags.isQuizReview) {
                    QuizModule.scanReviewPage();
                } else if (flags.isQuizAttempt) {
                    setTimeout(() => {
                        QuizModule.applyAttemptAnswers();
                    }, 400);
                } else if (flags.isQuizView) {
                    const stats = QuizModule.getQuizStats();
                    const statEl = document.getElementById('tk-quiz-view-stats');
                    if (statEl) {
                        statEl.innerHTML = `
                            <span>📝 <b>${stats.questionCount}</b> preguntas en memoria</span><br>
                            <span style="color:#15803d;">✅ <b>${stats.correctCount}</b> correctas</span> | 
                            <span style="color:#b91c1c;">❌ <b>${stats.incorrectCount}</b> a tachar</span><br>
                            <small style="color:#64748b;">Se aplicarán automáticamente al iniciar intento.</small>
                        `;
                    }
                }
            };

            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                run();
            } else {
                window.addEventListener('load', run);
            }
        }

        return { init, State, AutoAdvanceModule, QuizModule };
    })();

    MoodleToolkit.init();
})();
