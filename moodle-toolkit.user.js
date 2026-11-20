// ==UserScript==
// @name        Moodle Toolkit (Encuestas / Moodle / SCORM / Quiz)
// @namespace   http://tampermonkey.net/
// @version     6.4
// @description Herramientas inteligentes y adaptativas para Moodle (Virtual) y BanWeb (Tierra): Encuestas, SCORM, Auto-avance, Asistente de Quizzes/Exámenes, Copiador y Descargador de MP3.
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

                // 1. From response form action or hidden inputs in attempt.php
                const respForm = document.querySelector('form#responseform, form[action*="processattempt.php"], form[action*="attempt.php"]');
                if (respForm) {
                    const actionCmid = respForm.getAttribute('action')?.match(/[?&]cmid=(\d+)/);
                    if (actionCmid) return actionCmid[1];
                    const inputCmid = respForm.querySelector('input[name="cmid"]')?.value;
                    if (inputCmid) return inputCmid;
                }

                // 2. From body class (Moodle standard: cmid-XXXXX)
                const cmidClass = document.body?.className.match(/\bcmid-(\d+)\b/);
                if (cmidClass && cmidClass[1]) return cmidClass[1];

                // 3. From breadcrumb link (always points to current quiz view.php?id=...)
                const breadcrumbLink = document.querySelector('.breadcrumb a[href*="/mod/quiz/view.php"], .breadcrumb-item a[href*="/mod/quiz/view.php"], nav[aria-label*="breadcrumb" i] a[href*="/mod/quiz/view.php"]');
                if (breadcrumbLink) {
                    const m = breadcrumbLink.href.match(/[?&]id=(\d+)/);
                    if (m) return m[1];
                }

                // 4. From active navigation item in drawer / course index
                const activeNav = document.querySelector('.nav-link.active[href*="/mod/quiz/view.php"], .list-group-item.active[href*="/mod/quiz/view.php"], [aria-current="page"][href*="/mod/quiz/view.php"], .active[href*="/mod/quiz/view.php"]');
                if (activeNav) {
                    const m = activeNav.href.match(/[?&]id=(\d+)/);
                    if (m) return m[1];
                }

                // 5. Any generic input[name="cmid"]
                const cmidInput = document.querySelector('input[name="cmid"]');
                if (cmidInput && cmidInput.value) return cmidInput.value;

                // 6. Header title
                const h1Text = document.querySelector('#page-header h1, .page-header-headings h1, h1, h2')?.innerText?.trim();
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
                const qtext = qEl.querySelector('.qtext') || qEl.querySelector('.content .formulation');
                if (!qtext) return '';
                const clone = qtext.cloneNode(true);
                clone.querySelectorAll('.accesshide, .sr-only, select, input, script, style').forEach(el => el.remove());
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
                clone.querySelectorAll('input, .answernumber, .icon, .feedback, .sr-only, .accesshide, .tk-badge-wrong, .tk-badge-correct, .tk-badge-review-correct, .tk-badge-review-incorrect, script, style').forEach(el => el.remove());
                let raw = clone.innerText || clone.textContent || '';
                raw = raw.replace(/^[a-e0-9][.)\-]\s*/i, '');
                return this.normalizeText(raw);
            },

            getOptionCopyText(optEl) {
                if (!optEl) return '';
                const clone = optEl.cloneNode(true);
                clone.querySelectorAll('input, .icon, .feedback, .sr-only, .accesshide, .tk-badge-wrong, .tk-badge-correct, .tk-badge-review-correct, .tk-badge-review-incorrect, .tk-badge-deduced, script, style').forEach(el => el.remove());
                const raw = clone.innerText || clone.textContent || '';
                return raw.replace(/\s+/g, ' ').trim();
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
                if (stateText.includes('correcta') || stateText.includes('correct')) {
                    if (stateText.includes('parcialmente') || stateText.includes('partially')) return null;
                    return true;
                }
                if (stateText.includes('incorrecta') || stateText.includes('incorrect')) return false;

                const gradeText = qEl.querySelector('.info .grade')?.innerText || '';
                const m = gradeText.match(/([\d.,]+)\s*(?:sobre|out of|\/)\s*([\d.,]+)/i);
                if (m) {
                    const pts = parseFloat(m[1].replace(',', '.'));
                    const max = parseFloat(m[2].replace(',', '.'));
                    if (max > 0) {
                        if (pts >= max) return true;
                        if (pts === 0) return false;
                        return null;
                    }
                }
                return null;
            },

            getInputFeedbackState(el, qEl) {
                const next = el.nextElementSibling;
                if (next) {
                    if (next.querySelector('.text-success, .fa-check, img[src*="check"], [title*="correct" i]') ||
                        next.classList.contains('text-success') || next.classList.contains('fa-check') || next.classList.contains('correct')) {
                        return 'correct';
                    }
                    if (next.querySelector('.text-danger, .fa-remove, .fa-times, .fa-xmark, .fa-close, img[src*="cross"], [title*="incorrect" i]') ||
                        next.classList.contains('text-danger') || next.classList.contains('fa-remove') || next.classList.contains('fa-times') || next.classList.contains('incorrect')) {
                        return 'incorrect';
                    }
                }

                const container = el.closest('.form-check, tr, p, li, .r0, .r1, .control, .feedbackspan, div') || el.parentElement;
                if (container) {
                    const icons = container.querySelectorAll('.icon, i, img, .feedbackspan, span[class*="feedback"]');
                    for (const icon of icons) {
                        const html = icon.outerHTML || '';
                        const title = (icon.getAttribute('title') || icon.getAttribute('aria-label') || '').toLowerCase();
                        const alt = (icon.getAttribute('alt') || '').toLowerCase();
                        const cls = icon.className || '';

                        if (cls.includes('text-success') || cls.includes('fa-check') || title.includes('correct') || alt.includes('correct') || html.includes('text-success')) {
                            return 'correct';
                        }
                        if (cls.includes('text-danger') || cls.includes('fa-remove') || cls.includes('fa-times') || cls.includes('fa-xmark') || title.includes('incorrect') || alt.includes('incorrect') || html.includes('text-danger')) {
                            return 'incorrect';
                        }
                    }
                }

                const qState = this.isQuestionCorrect(qEl);
                if (qState === true) return 'correct';
                if (qState === false) return 'incorrect';

                return null;
            },

            getBlankKey(el, index) {
                const row = el.closest('tr, li, p, div') || el.parentElement;
                let text = '';
                if (row) {
                    const clone = row.cloneNode(true);
                    clone.querySelectorAll('select, input, .feedbackspan, .icon, script, style, .sr-only, .accesshide, .tk-badge-review-correct, .tk-badge-review-incorrect').forEach(n => n.remove());
                    text = this.normalizeText(clone.innerText || clone.textContent || '');
                }
                const name = el.getAttribute('name') || '';
                const subMatch = name.match(/sub(\d+)/i) || name.match(/_(\d+)/);
                const subId = subMatch ? subMatch[1] : '';

                return {
                    key: text ? text.substring(0, 60) : `idx_${index}`,
                    subId: subId,
                    index: index
                };
            },

            findBlankRecord(qRecord, el, index) {
                if (!qRecord || !qRecord.blanks) return null;
                const { key, subId } = this.getBlankKey(el, index);

                if (qRecord.blanks[key]) return qRecord.blanks[key];
                if (subId && qRecord.blanks[subId]) return qRecord.blanks[subId];
                if (qRecord.blanks[index]) return qRecord.blanks[index];
                if (qRecord.blanks[`idx_${index}`]) return qRecord.blanks[`idx_${index}`];

                for (const b of Object.values(qRecord.blanks)) {
                    if (b.index === index) return b;
                    if (subId && b.subId === subId) return b;
                    if (key && b.key && (b.key.includes(key) || key.includes(b.key))) return b;
                }
                return null;
            },

            getQuizData(quizId) {
                const key = `${this.storagePrefix}${quizId}`;
                try {
                    const data = JSON.parse(localStorage.getItem(key) || '{}');
                    if (data && data.questions && Object.keys(data.questions).length > 0) {
                        return data;
                    }
                } catch (e) { /* noop */ }

                // Fallback: If quizId didn't match directly, search for any saved quiz with matching title
                try {
                    const currentTitle = this.normalizeText(document.querySelector('#page-header h1, .page-header-headings h1, h1, h2')?.innerText || '');
                    if (currentTitle) {
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith(this.storagePrefix) && k !== key) {
                                const d = JSON.parse(localStorage.getItem(k) || '{}');
                                if (d && d.questions && Object.keys(d.questions).length > 0) {
                                    if (d.title && (this.normalizeText(d.title) === currentTitle || this.matchText(this.normalizeText(d.title), currentTitle))) {
                                        return d;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) { /* noop */ }

                return {};
            },

            saveQuizData(quizId, questionResults) {
                const storageKey = `${this.storagePrefix}${quizId}`;
                let data = this.getQuizData(quizId);
                if (!data.questions) data.questions = {};
                data.lastUpdated = Date.now();
                data.quizId = quizId;
                data.title = document.querySelector('#page-header h1, .page-header-headings h1, h1, h2')?.innerText?.trim() || '';

                questionResults.forEach(res => {
                    if (!res || !res.key) return;
                    if (!data.questions[res.key]) {
                        data.questions[res.key] = { correct: [], incorrect: [], blanks: {} };
                    }
                    const qRecord = data.questions[res.key];
                    if (!qRecord.blanks) qRecord.blanks = {};

                    (res.correct || []).forEach(c => {
                        if (!qRecord.correct.includes(c)) qRecord.correct.push(c);
                        const idx = qRecord.incorrect.indexOf(c);
                        if (idx !== -1) qRecord.incorrect.splice(idx, 1);
                    });

                    (res.incorrect || []).forEach(inc => {
                        if (!qRecord.incorrect.includes(inc) && !qRecord.correct.includes(inc)) {
                            qRecord.incorrect.push(inc);
                        }
                    });

                    if (res.blanks) {
                        for (const [bKey, bVal] of Object.entries(res.blanks)) {
                            if (!qRecord.blanks[bKey]) {
                                qRecord.blanks[bKey] = bVal;
                            } else {
                                const existing = qRecord.blanks[bKey];
                                (bVal.correct || []).forEach(c => {
                                    if (!existing.correct.includes(c)) existing.correct.push(c);
                                    const idx = existing.incorrect.indexOf(c);
                                    if (idx !== -1) existing.incorrect.splice(idx, 1);
                                });
                                (bVal.incorrect || []).forEach(inc => {
                                    if (!existing.incorrect.includes(inc) && !existing.correct.includes(inc)) {
                                        existing.incorrect.push(inc);
                                    }
                                });
                            }
                        }
                    }
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
                        if (!globalData[res.key]) globalData[res.key] = { correct: [], incorrect: [], blanks: {} };
                        const g = globalData[res.key];
                        if (!g.blanks) g.blanks = {};

                        (res.correct || []).forEach(c => {
                            if (!g.correct.includes(c)) g.correct.push(c);
                            const idx = g.incorrect.indexOf(c);
                            if (idx !== -1) g.incorrect.splice(idx, 1);
                        });
                        (res.incorrect || []).forEach(inc => {
                            if (!g.incorrect.includes(inc) && !g.correct.includes(inc)) {
                                g.incorrect.push(inc);
                            }
                        });
                        if (res.blanks) {
                            for (const [bKey, bVal] of Object.entries(res.blanks)) {
                                g.blanks[bKey] = bVal;
                            }
                        }
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
                const cleanOpt = this.normalizeText(optText);
                const cleanTarget = this.normalizeText(targetText);
                if (cleanOpt === cleanTarget) return true;
                if (cleanOpt.length > 5 && cleanTarget.length > 5) {
                    if (cleanOpt.includes(cleanTarget) || cleanTarget.includes(cleanOpt)) return true;
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

                    const rightAnswerEl = qEl.querySelector('.rightanswer');
                    const revealedRightAnswers = this.parseRightAnswers(rightAnswerEl);

                    const correctList = new Set();
                    const incorrectList = new Set();
                    const blanks = {};

                    revealedRightAnswers.forEach(ans => correctList.add(ans));

                    // 1. SCAN RADIOS & CHECKBOXES
                    const inputs = Array.from(qEl.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]'));
                    inputs.forEach(input => {
                        const row = input.closest('div[class*="r"], .form-check, li, tr') || input.parentElement;
                        const optText = this.cleanOptionText(row || input.parentElement);
                        if (!optText) return;

                        const isChecked = input.checked || input.hasAttribute('checked');
                        const state = this.getInputFeedbackState(input, qEl);

                        if (state === 'correct') {
                            correctList.add(optText);
                            this.markReviewOptionUI(row, 'correct');
                        } else if (state === 'incorrect') {
                            incorrectList.add(optText);
                            this.markReviewOptionUI(row, 'incorrect');
                        } else if (isChecked) {
                            const isCorrect = this.isQuestionCorrect(qEl);
                            if (isCorrect === true) {
                                correctList.add(optText);
                                this.markReviewOptionUI(row, 'correct');
                            } else if (isCorrect === false) {
                                incorrectList.add(optText);
                                this.markReviewOptionUI(row, 'incorrect');
                            }
                        }
                    });

                    // 2. SCAN SELECT DROPDOWNS (Gapselect, Cloze, Match)
                    const selects = Array.from(qEl.querySelectorAll('select'));
                    selects.forEach((sel, i) => {
                        const { key: bKey, subId } = this.getBlankKey(sel, i);
                        const selectedOpt = sel.options[sel.selectedIndex];
                        const optText = this.cleanOptionText(selectedOpt || sel);
                        const optVal = sel.value;
                        const state = this.getInputFeedbackState(sel, qEl);

                        if (state === 'correct' && optText) {
                            blanks[bKey] = { type: 'select', key: bKey, subId, index: i, correct: [optText], incorrect: [], value: optVal };
                            this.markReviewBlankUI(sel, 'correct');
                            totalCorrect++;
                        } else if (state === 'incorrect' && optText) {
                            blanks[bKey] = { type: 'select', key: bKey, subId, index: i, correct: [], incorrect: [optText], value: optVal };
                            this.markReviewBlankUI(sel, 'incorrect');
                            totalIncorrect++;
                        }
                    });

                    // 3. SCAN TEXT INPUTS (Cloze / Multianswer / Shortanswer fill-in-the-blanks)
                    const textInputs = Array.from(qEl.querySelectorAll('input[type="text"]'));
                    textInputs.forEach((txt, i) => {
                        if (txt.closest('.sr-only, .accesshide')) return;
                        const { key: bKey, subId } = this.getBlankKey(txt, i);
                        const val = (txt.value || '').trim();
                        const state = this.getInputFeedbackState(txt, qEl);

                        if (state === 'correct' && val) {
                            blanks[bKey] = { type: 'text', key: bKey, subId, index: i, correct: [val], incorrect: [] };
                            this.markReviewBlankUI(txt, 'correct');
                            totalCorrect++;
                        } else if (state === 'incorrect' && val) {
                            blanks[bKey] = { type: 'text', key: bKey, subId, index: i, correct: [], incorrect: [val] };
                            this.markReviewBlankUI(txt, 'incorrect');
                            totalIncorrect++;
                        }
                    });

                    // 4. SCAN DRAG AND DROP (ddwtos, ddimageortext, ddmarker)
                    const dropZones = Array.from(qEl.querySelectorAll('.dropzone, .drop.place, span.place, span[class*="place"]')).filter(el => {
                        return !el.classList.contains('draghome') && !el.classList.contains('drag');
                    });
                    dropZones.forEach((dz, i) => {
                        const pMatch = dz.className.match(/\bplace(\d+)\b/);
                        const placeNum = pMatch ? pMatch[1] : (i + 1).toString();
                        const bKey = `dd_p${placeNum}`;

                        const placedEl = dz.querySelector('.draghome, .drag, .choice, span') || dz;
                        const droppedText = this.cleanOptionText(placedEl);

                        const hiddenInput = qEl.querySelector(`input[name$="_p${placeNum}"], input.place${placeNum}`);
                        const choiceVal = hiddenInput?.value || '';

                        const state = this.getInputFeedbackState(dz, qEl);
                        if (state === 'correct' && droppedText) {
                            blanks[bKey] = { type: 'dd', key: bKey, placeNum, index: i, correct: [droppedText], incorrect: [], choiceVal };
                            this.markReviewBlankUI(dz, 'correct');
                            totalCorrect++;
                        } else if (state === 'incorrect' && droppedText) {
                            blanks[bKey] = { type: 'dd', key: bKey, placeNum, index: i, correct: [], incorrect: [droppedText], choiceVal };
                            this.markReviewBlankUI(dz, 'incorrect');
                            totalIncorrect++;
                        }
                    });

                    totalCorrect += correctList.size;
                    totalIncorrect += incorrectList.size;

                    results.push({
                        key: qKey,
                        correct: Array.from(correctList),
                        incorrect: Array.from(incorrectList),
                        blanks: blanks
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
                        badge.innerHTML = `${UiModule.Icons.checkCircle} <span>Guardada</span>`;
                        badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:8px; display:inline-flex; align-items:center; gap:4px; vertical-align:middle;';
                        label.appendChild(badge);
                    }
                } else if (type === 'incorrect') {
                    if (!row.querySelector('.tk-badge-review-incorrect')) {
                        const badge = document.createElement('span');
                        badge.className = 'tk-badge-review-incorrect';
                        badge.innerHTML = `${UiModule.Icons.xCircle} <span>Guardada (para tachar)</span>`;
                        badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:8px; display:inline-flex; align-items:center; gap:4px; vertical-align:middle;';
                        label.appendChild(badge);
                    }
                }
            },

            markReviewBlankUI(el, type) {
                const parent = el.parentElement;
                if (!parent || parent.dataset.tkBlankMarked) return;
                parent.dataset.tkBlankMarked = 'true';

                if (type === 'correct') {
                    el.style.borderColor = '#22c55e';
                    if (!parent.querySelector('.tk-badge-review-correct')) {
                        const badge = document.createElement('span');
                        badge.className = 'tk-badge-review-correct';
                        badge.innerHTML = `${UiModule.Icons.checkCircle} <span>Guardada</span>`;
                        badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 5px; border-radius:4px; font-weight:600; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                        parent.appendChild(badge);
                    }
                } else if (type === 'incorrect') {
                    el.style.borderColor = '#ef4444';
                    if (!parent.querySelector('.tk-badge-review-incorrect')) {
                        const badge = document.createElement('span');
                        badge.className = 'tk-badge-review-incorrect';
                        badge.innerHTML = `${UiModule.Icons.xCircle} <span>Guardada (para tachar)</span>`;
                        badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 5px; border-radius:4px; font-weight:600; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                        parent.appendChild(badge);
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

                    // 1. APPLY RADIOS & CHECKBOXES
                    const inputs = Array.from(qEl.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]'));
                    inputs.forEach(input => {
                        const row = input.closest('div[class*="r"], .form-check, li, tr') || input.parentElement;
                        const optText = this.cleanOptionText(row || input.parentElement);
                        if (!optText) return;

                        const isWrong = incorrect.some(inc => this.matchOption(optText, inc));
                        if (isWrong) {
                            this.markOptionIncorrect(row, input);
                            struckCount++;
                        }

                        const isCorrect = correct.some(c => this.matchOption(optText, c));
                        if (isCorrect) {
                            this.markOptionCorrectAndSelect(row, input);
                            filledCount++;
                        }
                    });

                    // 2. APPLY SELECT DROPDOWNS (Gapselect, Cloze, Match)
                    const selects = Array.from(qEl.querySelectorAll('select'));
                    selects.forEach((sel, i) => {
                        const blank = this.findBlankRecord(record, sel, i);
                        if (!blank) return;

                        if (blank.correct && blank.correct.length > 0) {
                            const target = blank.correct[0];
                            const matchOpt = Array.from(sel.options).find(o => this.matchOption(this.cleanOptionText(o), target));
                            if (matchOpt) {
                                sel.value = matchOpt.value;
                                sel.selectedIndex = matchOpt.index;
                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                                sel.dispatchEvent(new Event('input', { bubbles: true }));
                                sel.style.border = '2px solid #22c55e';
                                sel.style.backgroundColor = '#f0fdf4';

                                if (!sel.parentElement.querySelector('.tk-badge-correct')) {
                                    const badge = document.createElement('span');
                                    badge.className = 'tk-badge-correct';
                                    badge.innerHTML = `${UiModule.Icons.check} <span>Prellenada</span>`;
                                    badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                    sel.parentElement.appendChild(badge);
                                }
                                filledCount++;
                            }
                        }

                        if (blank.incorrect && blank.incorrect.length > 0) {
                            const wrongTarget = blank.incorrect[0];
                            const wrongOpt = Array.from(sel.options).find(o => this.matchOption(this.cleanOptionText(o), wrongTarget));
                            if (wrongOpt) {
                                if (!wrongOpt.text.includes('[Incorrecta')) {
                                    wrongOpt.text += ' [Incorrecta en intento previo]';
                                    wrongOpt.style.color = '#dc2626';
                                }
                                sel.style.border = '2px solid #ef4444';
                                sel.style.backgroundColor = '#fef2f2';

                                if (!sel.parentElement.querySelector('.tk-badge-wrong')) {
                                    const badge = document.createElement('span');
                                    badge.className = 'tk-badge-wrong';
                                    badge.innerHTML = `${UiModule.Icons.xCircle} <span>Intento anterior: "${wrongTarget}"</span>`;
                                    badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                    sel.parentElement.appendChild(badge);
                                }

                                const realOptions = Array.from(sel.options).filter(o => o.value !== '' && o.text.trim() !== '' && !o.text.includes('Choose') && !o.text.includes('Elegir'));
                                if (realOptions.length === 2) {
                                    const otherOpt = realOptions.find(o => !this.matchOption(this.cleanOptionText(o), wrongTarget));
                                    if (otherOpt && (!blank.correct || blank.correct.length === 0)) {
                                        sel.value = otherOpt.value;
                                        sel.selectedIndex = otherOpt.index;
                                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                                        sel.dispatchEvent(new Event('input', { bubbles: true }));
                                        sel.style.border = '2px solid #22c55e';
                                        sel.style.backgroundColor = '#f0fdf4';

                                        if (!sel.parentElement.querySelector('.tk-badge-deduced')) {
                                            const deduceBadge = document.createElement('span');
                                            deduceBadge.className = 'tk-badge-deduced';
                                            deduceBadge.innerHTML = `${UiModule.Icons.check} <b>Prellenada (${otherOpt.text})</b> [deducida]`;
                                            deduceBadge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                            sel.parentElement.appendChild(deduceBadge);
                                        }
                                        filledCount++;
                                    }
                                }
                                struckCount++;
                            }
                        }
                    });

                    // 3. APPLY TEXT INPUTS (Cloze / Multianswer / Shortanswer fill-in-the-blanks)
                    const textInputs = Array.from(qEl.querySelectorAll('input[type="text"]'));
                    textInputs.forEach((txt, i) => {
                        if (txt.closest('.sr-only, .accesshide')) return;
                        const blank = this.findBlankRecord(record, txt, i);

                        if (blank && blank.correct && blank.correct.length > 0) {
                            txt.value = blank.correct[0];
                            txt.dispatchEvent(new Event('input', { bubbles: true }));
                            txt.dispatchEvent(new Event('change', { bubbles: true }));
                            txt.style.border = '2px solid #22c55e';
                            txt.style.backgroundColor = '#f0fdf4';

                            if (!txt.parentElement.querySelector('.tk-badge-correct')) {
                                const badge = document.createElement('span');
                                badge.className = 'tk-badge-correct';
                                badge.innerHTML = `${UiModule.Icons.check} <span>Prellenada</span>`;
                                badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                txt.parentElement.appendChild(badge);
                            }
                            filledCount++;
                        } else if (blank && blank.incorrect && blank.incorrect.length > 0) {
                            txt.style.border = '2px solid #ef4444';
                            txt.style.backgroundColor = '#fef2f2';

                            if (!txt.parentElement.querySelector('.tk-badge-wrong')) {
                                const badge = document.createElement('span');
                                badge.className = 'tk-badge-wrong';
                                badge.innerHTML = `${UiModule.Icons.xCircle} <span>Intento anterior: "${blank.incorrect[0]}"</span>`;
                                badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                txt.parentElement.appendChild(badge);
                            }
                            struckCount++;
                        }
                    });

                    // 4. APPLY DRAG AND DROP (ddwtos, ddimageortext, ddmarker)
                    const dropZones = Array.from(qEl.querySelectorAll('.dropzone, .drop.place, span.place, span[class*="place"]')).filter(el => {
                        return !el.classList.contains('draghome') && !el.classList.contains('drag');
                    });
                    dropZones.forEach((dz, i) => {
                        const pMatch = dz.className.match(/\bplace(\d+)\b/);
                        const placeNum = pMatch ? pMatch[1] : (i + 1).toString();
                        const bKey = `dd_p${placeNum}`;
                        const blank = record.blanks?.[bKey] || this.findBlankRecord(record, dz, i);
                        if (!blank) return;

                        const dragChoices = Array.from(qEl.querySelectorAll('.draghome, .drag, [class*="choice"]'));

                        // Case A: Correct choice known
                        if (blank.correct && blank.correct.length > 0) {
                            const targetText = blank.correct[0];
                            const matchChoice = dragChoices.find(c => this.matchOption(this.cleanOptionText(c), targetText));

                            // Update hidden input if present
                            const hiddenInput = qEl.querySelector(`input[name$="_p${placeNum}"], input.place${placeNum}`);
                            if (hiddenInput) {
                                const cMatch = matchChoice?.className.match(/\bchoice(\d+)\b/);
                                const cVal = cMatch ? cMatch[1] : (matchChoice?.dataset.choice || matchChoice?.dataset.dragNo || blank.choiceVal);
                                if (cVal) {
                                    hiddenInput.value = cVal;
                                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                                    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }

                            // Trigger click-to-place / drag-and-drop accessibility events
                            if (matchChoice) {
                                matchChoice.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                matchChoice.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                dz.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                dz.dispatchEvent(new MouseEvent('click', { bubbles: true }));

                                matchChoice.style.opacity = '0.55';
                                matchChoice.style.border = '2px solid #22c55e';
                            }

                            dz.style.border = '2px solid #22c55e';
                            dz.style.backgroundColor = '#f0fdf4';
                            dz.style.borderRadius = '4px';

                            if (!dz.parentElement.querySelector(`.tk-badge-dd-${placeNum}`)) {
                                const badge = document.createElement('span');
                                badge.className = `tk-badge-correct tk-badge-dd-${placeNum}`;
                                badge.innerHTML = `${UiModule.Icons.check} <span>[${targetText}]</span>`;
                                badge.style.cssText = 'background:#dcfce7; color:#15803d; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                dz.parentElement.appendChild(badge);
                            }
                            filledCount++;
                        }

                        // Case B: Incorrect choice known
                        if (blank.incorrect && blank.incorrect.length > 0) {
                            const wrongText = blank.incorrect[0];
                            const wrongChoice = dragChoices.find(c => this.matchOption(this.cleanOptionText(c), wrongText));

                            if (wrongChoice) {
                                wrongChoice.style.textDecoration = 'line-through 2px #dc2626';
                                wrongChoice.style.color = '#dc2626';
                                wrongChoice.style.background = '#fee2e2';
                                wrongChoice.title = `Incorrecta para casilla ${placeNum} en el intento anterior`;
                            }

                            dz.style.border = '2px dashed #ef4444';
                            dz.style.backgroundColor = '#fef2f2';

                            if (!dz.parentElement.querySelector(`.tk-badge-dd-wrong-${placeNum}`)) {
                                const badge = document.createElement('span');
                                badge.className = `tk-badge-wrong tk-badge-dd-wrong-${placeNum}`;
                                badge.innerHTML = `${UiModule.Icons.xCircle} <span>Casilla ${placeNum}: NO va "${wrongText}"</span>`;
                                badge.style.cssText = 'background:#fee2e2; color:#b91c1c; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; margin-left:6px; display:inline-flex; align-items:center; gap:3px; vertical-align:middle;';
                                dz.parentElement.appendChild(badge);
                            }
                            struckCount++;
                        }
                    });
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
                    badge.innerHTML = `${UiModule.Icons.xCircle} <b>Incorrecta</b> (intento previo)`;
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
                    badge.innerHTML = `${UiModule.Icons.checkCircle} <b>Correcta</b> (prellenada)`;
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
                        if (q.blanks) {
                            Object.values(q.blanks).forEach(b => {
                                correctCount += (b.correct || []).length;
                                incorrectCount += (b.incorrect || []).length;
                            });
                        }
                    });
                }
                const totalItems = correctCount + incorrectCount;
                return { questionCount, correctCount, incorrectCount, totalItems };
            },

            updatePanelReviewStats(data) {
                const statEl = document.getElementById('tk-quiz-review-stats');
                if (!statEl) return;
                const stats = this.getQuizStats();
                const icons = UiModule.Icons;
                statEl.innerHTML = `
                    <div class="tk-card">
                        <div class="tk-stat-header">
                            <span class="tk-stat-title">
                                ${icons.fileText} <b>${stats.questionCount}</b> Preguntas
                            </span>
                            <span class="tk-pill">
                                ${stats.totalItems} casillas / ítems
                            </span>
                        </div>
                        <div class="tk-stat-desc">
                            Total de preguntas y casillas analizadas en la prueba.
                        </div>
                    </div>
                    <div class="tk-stat-list">
                        <div class="tk-stat-item tk-stat-correct">
                            ${icons.checkCircle} <span><b>${stats.correctCount}</b> casillas correctas guardadas</span>
                        </div>
                        <div class="tk-stat-item tk-stat-incorrect">
                            ${icons.xCircle} <span><b>${stats.incorrectCount}</b> casillas a corregir (tachadas)</span>
                        </div>
                    </div>
                `;
            },

            updatePanelAttemptStats(filledCount, struckCount) {
                const statEl = document.getElementById('tk-quiz-attempt-stats');
                if (!statEl) return;
                const stats = this.getQuizStats();
                const icons = UiModule.Icons;

                if (stats.questionCount === 0) {
                    const section = statEl.closest('.tk-section');
                    if (section) {
                        section.innerHTML = `
                            <label class="tk-label">${icons.brain} Asistente de Quiz (Intento)</label>
                            <div class="tk-stat-desc" style="margin-bottom:8px;">
                                Sin respuestas memorizadas para este examen. Debes revisar un intento anterior para guardarlas.
                            </div>
                            <button id="btn-tk-quiz-copy-all" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px;">
                                ${icons.clipboard} Copiar preguntas del examen
                            </button>
                        `;
                        const copyBtn = section.querySelector('#btn-tk-quiz-copy-all');
                        if (copyBtn) copyBtn.onclick = () => QuizModule.copyAllQuizContent();
                    }
                    return;
                }

                statEl.innerHTML = `
                    <div class="tk-card">
                        <div class="tk-stat-header">
                            <span class="tk-stat-title">
                                ${icons.fileText} <b>${stats.questionCount}</b> Preguntas
                            </span>
                            <span class="tk-pill">
                                ${stats.totalItems} casillas / ítems
                            </span>
                        </div>
                        <div class="tk-stat-desc">
                            Respuestas aplicadas de intentos anteriores.
                        </div>
                    </div>
                    <div class="tk-stat-list">
                        <div class="tk-stat-item tk-stat-correct">
                            ${icons.checkCircle} <span><b>${filledCount}</b> casillas prellenadas automáticamente</span>
                        </div>
                        <div class="tk-stat-item tk-stat-incorrect">
                            ${icons.xCircle} <span><b>${struckCount}</b> opciones incorrectas tachadas</span>
                        </div>
                    </div>
                `;
            },

            formatQuestionForCopy(qEl) {
                if (!qEl) return '';
                const qNo = qEl.querySelector('.info .no, .info .qno')?.innerText?.trim() || 'Pregunta';

                const formulation = qEl.querySelector('.content .formulation') || qEl.querySelector('.content');
                if (!formulation) return '';
                const clone = formulation.cloneNode(true);

                clone.querySelectorAll('script, style, .sr-only, .accesshide, .questionflag, .tk-badge-correct, .tk-badge-wrong, .tk-badge-review-correct, .tk-badge-review-incorrect, .tk-badge-deduced, .tk-audio-dl-btn, .tk-btn-copy-q').forEach(n => n.remove());

                const isPlaceholder = (text) => {
                    if (!text) return true;
                    const t = text.trim();
                    return /^(elegir|choose|seleccionar|select|\-\-\-)\b/i.test(t) || t === '___';
                };

                // Replace selects with [valor] & extract options
                const origSelects = formulation.querySelectorAll('select');
                const cloneSelects = clone.querySelectorAll('select');
                const selectOptionGroups = [];

                origSelects.forEach((oSel, i) => {
                    const selectedOpt = oSel?.options[oSel.selectedIndex];
                    const rawVal = selectedOpt?.text?.trim() || oSel?.value || '';
                    const val = isPlaceholder(rawVal) ? '___' : rawVal;
                    const cSel = cloneSelects[i];
                    if (cSel) {
                        const span = document.createElement('span');
                        span.textContent = ` [${val}] `;
                        cSel.replaceWith(span);
                    }

                    const opts = Array.from(oSel.options)
                        .map(o => o.text?.trim())
                        .filter(t => t && !isPlaceholder(t));
                    if (opts.length > 0) {
                        selectOptionGroups.push({ index: i + 1, options: opts });
                    }
                });

                let optionsText = '';
                if (selectOptionGroups.length > 0) {
                    const firstOpts = selectOptionGroups[0].options;
                    const firstStr = JSON.stringify(firstOpts);
                    const allSame = selectOptionGroups.every(g => JSON.stringify(g.options) === firstStr);

                    if (allSame) {
                        optionsText = '\nOpciones disponibles:\n' + firstOpts.map(opt => `  • ${opt}`).join('\n');
                    } else {
                        optionsText = '\nOpciones por casilla:\n' + selectOptionGroups.map(g => `  [Casilla ${g.index}]: ${g.options.join(' | ')}`).join('\n');
                    }
                }

                // Replace text inputs with [valor]
                const origInputs = formulation.querySelectorAll('input[type="text"]');
                const cloneInputs = clone.querySelectorAll('input[type="text"]');
                cloneInputs.forEach((cInp, i) => {
                    const oInp = origInputs[i];
                    const val = oInp?.value?.trim() || '___';
                    const span = document.createElement('span');
                    span.textContent = ` [${val}] `;
                    cInp.replaceWith(span);
                });

                // Replace drop zones with [valor] & extract draggable options if available
                const origDrops = formulation.querySelectorAll('.dropzone, .drop.place, span[class*="place"]');
                const cloneDrops = clone.querySelectorAll('.dropzone, .drop.place, span[class*="place"]');
                cloneDrops.forEach((cDrp, i) => {
                    const oDrp = origDrops[i];
                    const val = oDrp?.innerText?.trim() || '___';
                    const span = document.createElement('span');
                    span.textContent = ` [${val}] `;
                    cDrp.replaceWith(span);
                });

                if (selectOptionGroups.length === 0 && origDrops.length > 0) {
                    const dragItems = Array.from(formulation.querySelectorAll('.draghome, .drag, [class*="dragitem"]'))
                        .map(el => this.getOptionCopyText(el))
                        .filter(t => t && t.length > 0);
                    const uniqueDragItems = Array.from(new Set(dragItems));
                    if (uniqueDragItems.length > 0) {
                        clone.querySelectorAll('.drags, .draghomes, .dragitems, .draghome, .drag').forEach(n => n.remove());
                        optionsText = '\nOpciones disponibles (arrastrables):\n' + uniqueDragItems.map(opt => `  • ${opt}`).join('\n');
                    }
                }

                // Format choices for multichoice / truefalse
                const origAnswers = formulation.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]');
                if (origAnswers.length > 0) {
                    const answerBlock = clone.querySelector('.answer');
                    if (answerBlock) {
                        let choiceText = '\nOpciones:';
                        origAnswers.forEach(ans => {
                            const row = ans.closest('div[class*="r"], .form-check, li, tr') || ans.parentElement;
                            const optText = this.getOptionCopyText(row);
                            const isChecked = ans.checked || ans.hasAttribute('checked');
                            choiceText += `\n  ${isChecked ? '[X]' : '[ ]'} ${optText}`;
                        });
                        answerBlock.innerText = choiceText;
                    }
                }

                const rightAnswer = qEl.querySelector('.rightanswer')?.innerText?.trim();

                let output = `${qNo}\n\n`;
                output += `${clone.innerText.trim()}\n`;
                if (optionsText) {
                    output += `${optionsText}\n`;
                }
                if (rightAnswer) {
                    output += `\n${rightAnswer}\n`;
                }
                return output;
            },

            copyAllQuizContent() {
                const questions = document.querySelectorAll('.que');
                if (questions.length === 0) {
                    alert('No se detectaron preguntas en esta página para copiar.');
                    return;
                }
                const title = document.querySelector('#page-header h1, .page-header-headings h1, h1, h2')?.innerText?.trim() || 'Examen';
                let fullText = `${title}\n\n`;

                questions.forEach(qEl => {
                    fullText += this.formatQuestionForCopy(qEl) + `\n\n`;
                });

                navigator.clipboard.writeText(fullText).then(() => {
                    alert(`📋 ¡Listo! Se copiaron ${questions.length} preguntas al portapapeles con todas sus respuestas y valores.`);
                }).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = fullText;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    textarea.remove();
                    alert(`📋 ¡Listo! Se copiaron ${questions.length} preguntas al portapapeles.`);
                });
            },

            injectQuestionCopyButtons() {
                const questions = document.querySelectorAll('.que');
                questions.forEach(qEl => {
                    const info = qEl.querySelector('.info');
                    if (!info || info.querySelector('.tk-btn-copy-q')) return;

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'tk-btn-copy-q';
                    copyBtn.type = 'button';
                    copyBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:3px;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        <span>Copiar</span>
                    `;
                    copyBtn.title = 'Copiar esta pregunta completa con sus valores al portapapeles';
                    copyBtn.style.cssText = `
                        display: inline-flex; align-items: center; justify-content: center;
                        height: 24px; padding: 0 8px; font-size: 11px; font-weight: 500;
                        color: #475569; background: #ffffff; border: 1px solid #cbd5e1;
                        border-radius: 6px; cursor: pointer; margin-top: 6px; font-family: inherit;
                        transition: all 0.15s ease; width: 100%; box-sizing: border-box;
                    `;
                    copyBtn.onmouseenter = () => { copyBtn.style.background = '#f1f5f9'; copyBtn.style.color = '#0f172a'; };
                    copyBtn.onmouseleave = () => { copyBtn.style.background = '#ffffff'; copyBtn.style.color = '#475569'; };

                    copyBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const text = this.formatQuestionForCopy(qEl);
                        navigator.clipboard.writeText(text).then(() => {
                            copyBtn.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>
                                <span>¡Copiada!</span>
                            `;
                            setTimeout(() => {
                                copyBtn.innerHTML = `
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:3px;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                    <span>Copiar</span>
                                `;
                            }, 1500);
                        });
                    };

                    info.appendChild(copyBtn);
                });
            }
        };

        const AudioModule = {
            injectDownloadButtons() {
                const audioEls = document.querySelectorAll('audio, .video-js.vjs-audio, .mediaplugin_audio, [data-region*="mediaplugin"]');
                audioEls.forEach(audioContainer => {
                    if (audioContainer.dataset.tkAudioDlInjected) return;

                    let audioSrc = '';
                    if (audioContainer.tagName === 'AUDIO') {
                        audioSrc = audioContainer.src || audioContainer.currentSrc || audioContainer.querySelector('source')?.src;
                    } else {
                        const audio = audioContainer.querySelector('audio');
                        audioSrc = audio?.src || audio?.currentSrc || audio?.querySelector('source')?.src;
                        if (!audioSrc) {
                            const a = audioContainer.querySelector('a[href*=".mp3"], a[href*="pluginfile.php"]');
                            audioSrc = a?.href;
                        }
                    }

                    if (!audioSrc) return;
                    audioContainer.dataset.tkAudioDlInjected = 'true';

                    const targetContainer = audioContainer.closest('.video-js, .mediaplugin, .mediaplugin_audio') || audioContainer;

                    let filename = 'audio.mp3';
                    try {
                        const u = new URL(audioSrc, window.location.href);
                        const parts = u.pathname.split('/');
                        const last = parts[parts.length - 1];
                        if (last && (last.endsWith('.mp3') || last.endsWith('.m4a') || last.endsWith('.wav') || last.endsWith('.ogg'))) {
                            filename = decodeURIComponent(last);
                        }
                    } catch (e) { /* noop */ }

                    const dlBtn = document.createElement('button');
                    dlBtn.className = 'tk-audio-dl-btn';
                    dlBtn.type = 'button';
                    dlBtn.title = 'Descargar este archivo de audio MP3';
                    dlBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Descargar MP3</span>
                    `;
                    dlBtn.style.cssText = `
                        display: inline-flex; align-items: center; justify-content: center;
                        height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600;
                        color: #0f172a; background: #f1f5f9; border: 1px solid #cbd5e1;
                        border-radius: 6px; cursor: pointer; margin: 6px 0; transition: all 0.15s ease;
                        font-family: inherit; vertical-align: middle;
                    `;
                    dlBtn.onmouseenter = () => { dlBtn.style.background = '#e2e8f0'; dlBtn.style.borderColor = '#94a3b8'; };
                    dlBtn.onmouseleave = () => { dlBtn.style.background = '#f1f5f9'; dlBtn.style.borderColor = '#cbd5e1'; };

                    dlBtn.onclick = async (e) => {
                        e.preventDefault();
                        dlBtn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px; animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            <span>Descargando...</span>
                        `;
                        try {
                            const response = await fetch(audioSrc, { credentials: 'include' });
                            const blob = await response.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            const tempA = document.createElement('a');
                            tempA.href = blobUrl;
                            tempA.download = filename;
                            document.body.appendChild(tempA);
                            tempA.click();
                            tempA.remove();
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                            dlBtn.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
                                <span>¡Descargado!</span>
                            `;
                            setTimeout(() => {
                                dlBtn.innerHTML = `
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    <span>Descargar MP3</span>
                                `;
                            }, 2000);
                        } catch (err) {
                            window.open(audioSrc, '_blank');
                            dlBtn.innerHTML = `<span>Descargar MP3</span>`;
                        }
                    };

                    const parent = targetContainer.parentElement;
                    if (parent) {
                        const wrapperDiv = document.createElement('div');
                        wrapperDiv.style.cssText = 'display:flex; align-items:center; gap:8px; margin: 4px 0 8px 0;';
                        wrapperDiv.appendChild(dlBtn);
                        targetContainer.insertAdjacentElement('afterend', wrapperDiv);
                    }
                });
            },

            observe() {
                this.injectDownloadButtons();
                let count = 0;
                const interval = setInterval(() => {
                    this.injectDownloadButtons();
                    count++;
                    if (count > 10) clearInterval(interval);
                }, 1000);
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
                trash: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
                clipboard: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
                checkCircle: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
                xCircle: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
                fileText: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
                download: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
                check: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
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
                    #moodle-toolkit-panel .tk-card {
                        background: #f8fafc; border: 1px solid #e2e8f0;
                        border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
                    }
                    #moodle-toolkit-panel .tk-stat-header {
                        display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
                    }
                    #moodle-toolkit-panel .tk-stat-title {
                        font-weight: 600; color: #0f172a; font-size: 13px;
                        display: flex; align-items: center; gap: 6px;
                    }
                    #moodle-toolkit-panel .tk-stat-title svg { color: #64748b; flex-shrink: 0; }
                    #moodle-toolkit-panel .tk-stat-desc {
                        color: #64748b; font-size: 11px; line-height: 1.35;
                    }
                    #moodle-toolkit-panel .tk-pill {
                        background: #e0f2fe; color: #0369a1; font-size: 11px;
                        padding: 2px 8px; border-radius: 9999px; font-weight: 600;
                    }
                    #moodle-toolkit-panel .tk-stat-list {
                        display: flex; flex-direction: column; gap: 6px; padding: 2px 0; margin-bottom: 6px;
                    }
                    #moodle-toolkit-panel .tk-stat-item {
                        display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500;
                    }
                    #moodle-toolkit-panel .tk-stat-item svg { flex-shrink: 0; }
                    #moodle-toolkit-panel .tk-stat-correct { color: #15803d; }
                    #moodle-toolkit-panel .tk-stat-correct svg { color: #16a34a; }
                    #moodle-toolkit-panel .tk-stat-incorrect { color: #b91c1c; }
                    #moodle-toolkit-panel .tk-stat-incorrect svg { color: #dc2626; }
                    .tk-badge-correct { background: #dcfce7 !important; color: #15803d !important; border: 1px solid #bbf7d0; }
                    .tk-badge-wrong { background: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #fecaca; }
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
                        #moodle-toolkit-panel .tk-btn-outline:hover:not(:disabled) { background: #1e293b; border-color: #475569; }
                        #moodle-toolkit-panel .tk-select { background: #0f172a; color: #f8fafc; border-color: #334155; }
                        #moodle-toolkit-panel .tk-timer { background: #052e16; color: #86efac; border-color: #166534; }
                        #moodle-toolkit-panel .tk-section { border-top-color: #334155; }
                        #moodle-toolkit-panel .tk-label { color: #94a3b8; }
                        #moodle-toolkit-panel .tk-card { background: #1e293b !important; border-color: #334155 !important; }
                        #moodle-toolkit-panel .tk-stat-title { color: #f8fafc !important; }
                        #moodle-toolkit-panel .tk-stat-title svg { color: #94a3b8 !important; }
                        #moodle-toolkit-panel .tk-stat-desc { color: #cbd5e1 !important; }
                        #moodle-toolkit-panel .tk-pill { background: #0c4a6e !important; color: #38bdf8 !important; }
                        #moodle-toolkit-panel .tk-stat-correct { color: #86efac !important; }
                        #moodle-toolkit-panel .tk-stat-correct svg { color: #4ade80 !important; }
                        #moodle-toolkit-panel .tk-stat-incorrect { color: #fca5a5 !important; }
                        #moodle-toolkit-panel .tk-stat-incorrect svg { color: #f87171 !important; }
                        .tk-badge-correct { background: #064e3b !important; color: #86efac !important; border-color: #059669 !important; }
                        .tk-badge-wrong { background: #7f1d1d !important; color: #fca5a5 !important; border-color: #dc2626 !important; }
                        #tk-quiz-review-stats, #tk-quiz-attempt-stats, #tk-quiz-view-stats { color: #cbd5e1 !important; }
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
                            <button id="btn-tk-quiz-copy-all" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px; margin-bottom:6px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px;">
                                ${this.Icons.clipboard} Copiar preguntas del examen
                            </button>
                            <button id="btn-tk-quiz-clear" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px;">
                                ${this.Icons.trash} Limpiar memoria
                            </button>
                        </div>`;
                }

                if (flags.isQuizAttempt) {
                    const stats = QuizModule.getQuizStats();
                    const hasData = stats.questionCount > 0;

                    html += `
                        <div class="tk-section" style="border-top:none; padding-top:0;">
                            <label class="tk-label">${this.Icons.brain} Asistente de Quiz (Intento)</label>`;

                    if (!hasData) {
                        html += `
                            <div class="tk-stat-desc" style="margin-bottom:8px;">
                                Sin respuestas memorizadas para este examen. Debes revisar un intento anterior para guardarlas.
                            </div>
                            <button id="btn-tk-quiz-copy-all" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px;">
                                ${this.Icons.clipboard} Copiar preguntas del examen
                            </button>
                        </div>`;
                    } else {
                        html += `
                            <div id="tk-quiz-attempt-stats" style="font-size:12px; color:#475569; margin-bottom:8px; line-height:1.4;">
                                Cargando respuestas memorizadas...
                            </div>
                            <div class="tk-row" style="margin-bottom:6px;">
                                <button id="btn-tk-quiz-apply" class="tk-btn tk-btn-primary" style="flex:1;">
                                    ${this.Icons.zap} Re-aplicar Respuestas
                                </button>
                            </div>
                            <button id="btn-tk-quiz-copy-all" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px; margin-bottom:6px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px;">
                                ${this.Icons.clipboard} Copiar preguntas del examen
                            </button>
                            <button id="btn-tk-quiz-clear" class="tk-btn tk-btn-outline" style="font-size:11px; height:28px;">
                                ${this.Icons.trash} Limpiar memoria
                            </button>
                        </div>`;
                    }
                }

                if (flags.isQuizView && !flags.isQuizReview && !flags.isQuizAttempt) {
                    const stats = QuizModule.getQuizStats();
                    const hasData = stats.questionCount > 0;
                    if (hasData) {
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

                const copyAllBtn = document.getElementById('btn-tk-quiz-copy-all');
                if (copyAllBtn) {
                    copyAllBtn.onclick = () => QuizModule.copyAllQuizContent();
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
                        const icons = UiModule.Icons;
                        statEl.innerHTML = `
                            <div class="tk-stat-list" style="margin-bottom:6px;">
                                <div class="tk-stat-item">
                                    ${icons.fileText} <span><b>${stats.questionCount}</b> preguntas en memoria</span>
                                </div>
                                <div class="tk-stat-item tk-stat-correct">
                                    ${icons.checkCircle} <span><b>${stats.correctCount}</b> correctas</span>
                                </div>
                                <div class="tk-stat-item tk-stat-incorrect">
                                    ${icons.xCircle} <span><b>${stats.incorrectCount}</b> a tachar</span>
                                </div>
                            </div>
                            <div class="tk-stat-desc">Se aplicarán automáticamente al iniciar intento.</div>
                        `;
                    }
                }

                QuizModule.injectQuestionCopyButtons();
                AudioModule.observe();
            };

            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                run();
            } else {
                window.addEventListener('load', run);
            }
        }

        return { init, State, AutoAdvanceModule, QuizModule, AudioModule };
    })();

    MoodleToolkit.init();
})();
