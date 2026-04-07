// ==UserScript==
// @name         MyVoice → Asana Task Creator UNIVERSAL
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  Creates Asana tasks from MyVoice - universal version
// @author       Atlas
// @match        https://app.asana.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    var LOG = function(m) {
        console.log('%c[Asana-Creator] ' + m, 'color:#f06a35;font-weight:bold');
    };

    // ═══════════════════════════════════════════════════════
    //  CONFIG
    // ═══════════════════════════════════════════════════════
    var SECTION_NAME  = 'My Voice'; // overridden by task data
    var SESSION_KEY   = 'mv_pending_task_v37';
    var DONE_KEY      = 'mv_done_tasks_v37';
    var WAIT_READY_MS = 4000;

    // ═══════════════════════════════════════════════════════
    //  STEP 1 — CAPTURE URL PARAM (document-start)
    //  Runs BEFORE Asana SPA redirects and removes query params
    // ═══════════════════════════════════════════════════════
    (function captureURLParam() {
        try {
            var params  = new URLSearchParams(window.location.search);
            var encoded = params.get('mvtask');
            if (!encoded) return;
            var json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
            var task = JSON.parse(json);
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(task));
            LOG('✅ Task captured: ' + task.name);
            try {
                var clean = window.location.href
                    .replace(/[?&]mvtask=[^&]+/, '')
                    .replace(/\?$/, '').replace(/&$/, '');
                window.history.replaceState({}, '', clean);
            } catch(e) {}
        } catch(e) { LOG('Capture error: ' + e.message); }
    })();

    // ═══════════════════════════════════════════════════════
    //  STYLES
    // ═══════════════════════════════════════════════════════
    function injectStyles() {
        var s = document.createElement('style');
        s.textContent = [
            '#mv-ov{position:fixed!important;inset:0!important;',
            '  background:rgba(0,0,0,0.5)!important;z-index:9999999!important;',
            '  display:flex!important;align-items:center!important;justify-content:center!important;}',
            '#mv-box{background:#fff!important;border-radius:14px!important;',
            '  padding:28px 32px!important;max-width:540px!important;width:92vw!important;',
            '  box-shadow:0 12px 48px rgba(0,0,0,0.22)!important;',
            '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;',
            '  color:#1e1e1e!important;}',
            '#mv-box h2{margin:0 0 10px!important;font-size:19px!important;color:#f06a35!important;',
            '  display:flex!important;align-items:center!important;gap:10px!important;}',
            '#mv-box p{font-size:13px!important;color:#666!important;margin:0 0 10px!important;}',
            '#mv-box .mv-prev{background:#fdf6f2!important;border:1px solid #f0ddd0!important;',
            '  border-radius:8px!important;padding:13px 15px!important;margin:10px 0!important;',
            '  font-size:12px!important;line-height:1.8!important;}',
            '#mv-box .mv-prev strong{color:#f06a35!important;}',
            '#mv-box .mv-fl{margin-bottom:12px!important;}',
            '#mv-box .mv-fl label{display:block!important;font-size:10px!important;',
            '  font-weight:700!important;color:#999!important;text-transform:uppercase!important;',
            '  letter-spacing:.5px!important;margin-bottom:4px!important;}',
            '#mv-box .mv-fl input{width:100%!important;border:1.5px solid #ddd!important;',
            '  border-radius:7px!important;padding:8px 11px!important;font-size:13px!important;',
            '  box-sizing:border-box!important;color:#222!important;',
            '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;}',
            '#mv-box .mv-fl input:focus{outline:none!important;border-color:#f06a35!important;',
            '  box-shadow:0 0 0 3px rgba(240,106,53,0.15)!important;}',
            '#mv-box .mv-acts{display:flex!important;gap:10px!important;',
            '  justify-content:flex-end!important;margin-top:16px!important;}',
            '#mv-box .mv-cancel{padding:9px 20px!important;border:1px solid #ccc!important;',
            '  background:#fff!important;border-radius:7px!important;cursor:pointer!important;',
            '  font-size:13px!important;color:#555!important;}',
            '#mv-box .mv-cancel:hover{background:#f5f5f5!important;}',
            '#mv-box .mv-create{padding:9px 24px!important;background:#f06a35!important;',
            '  color:#fff!important;border:none!important;border-radius:7px!important;',
            '  cursor:pointer!important;font-size:13px!important;font-weight:700!important;',
            '  min-width:160px!important;}',
            '#mv-box .mv-create:hover{background:#d4551f!important;}',
            '#mv-box .mv-create:disabled{background:#ccc!important;cursor:wait!important;}',
            '@keyframes mv-spin{to{transform:rotate(360deg)}}',
            '.mv-spin{display:inline-block!important;width:13px!important;height:13px!important;',
            '  border:2px solid #fff!important;border-top-color:transparent!important;',
            '  border-radius:50%!important;animation:mv-spin 0.7s linear infinite!important;',
            '  vertical-align:middle!important;margin-right:5px!important;}',
            '#mv-status{margin-top:12px!important;font-size:12px!important;',
            '  font-weight:600!important;min-height:20px!important;text-align:center!important;}',
            '.mv-s-ok{color:#27ae60!important;}',
            '.mv-s-err{color:#e67e22!important;}',
            '.mv-s-info{color:#2980b9!important;}',
        ].join('\n');
        (document.head || document.documentElement).appendChild(s);
    }

    // ═══════════════════════════════════════════════════════
    //  UTILITY
    // ═══════════════════════════════════════════════════════
    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    function setStatus(el, msg, type) {
        el.className = 'mv-s-' + (type || 'info');
        el.textContent = msg;
        LOG(msg);
    }

    function esc(s) {
        return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function getDoneIds() {
        try { return JSON.parse(localStorage.getItem(DONE_KEY)||'[]'); } catch(e) { return []; }
    }

    function markDone(id) {
        var ids = getDoneIds();
        if (ids.indexOf(id)===-1) ids.push(id);
        localStorage.setItem(DONE_KEY, JSON.stringify(ids));
    }

    // ═══════════════════════════════════════════════════════
    //  HUMAN INPUT SIMULATION
    // ═══════════════════════════════════════════════════════
    function humanClick(el) {
        if (!el) return;
        ['mousedown','mouseup','click'].forEach(function(ev) {
            el.dispatchEvent(new MouseEvent(ev, {bubbles:true, cancelable:true}));
        });
    }

    function hoverOn(el) {
        if (!el) return;
        ['mouseenter','mouseover','mousemove'].forEach(function(ev) {
            el.dispatchEvent(new MouseEvent(ev, {bubbles:true, cancelable:true}));
        });
    }

    async function typeInField(field, text) {
        if (!field) return;
        field.focus();
        await sleep(200);
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await sleep(100);
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            field.dispatchEvent(new KeyboardEvent('keydown', {key:ch, bubbles:true}));
            document.execCommand('insertText', false, ch);
            field.dispatchEvent(new KeyboardEvent('keyup',   {key:ch, bubbles:true}));
            await sleep(12);
        }
        field.dispatchEvent(new Event('input',  {bubbles:true}));
        field.dispatchEvent(new Event('change', {bubbles:true}));
        await sleep(200);
    }

    // ═══════════════════════════════════════════════════════
    //  FIND TARGET SECTION
    //  Real selectors from DOM diagnostic:
    //    button.PotColumnName-nameButton with text = SECTION_NAME
    // ═══════════════════════════════════════════════════════
    async function findSection(statusEl) {
        for (var attempt = 0; attempt < 20; attempt++) {
            setStatus(statusEl,
                '🔍 Looking for section "' + SECTION_NAME + '"... (' + (attempt+1) + '/20)',
                'info'
            );

            // Method 1: precise selector from DOM diagnostic
            var nameBtns = document.querySelectorAll('button.PotColumnName-nameButton');
            for (var i = 0; i < nameBtns.length; i++) {
                var btn = nameBtns[i];
                if ((btn.textContent||'').trim().toLowerCase() === SECTION_NAME.toLowerCase()) {
                    LOG('Section found: "' + SECTION_NAME + '"');
                    var container = btn.closest('.PotColumnName') ||
                        btn.closest('.PotGroupName') || btn.parentElement;
                    return { sectionEl: btn, container: container };
                }
            }

            // Method 2: PotGroupName
            var groupNames = document.querySelectorAll('.PotGroupName');
            for (var j = 0; j < groupNames.length; j++) {
                if ((groupNames[j].textContent||'').trim().toLowerCase()
                    .indexOf(SECTION_NAME.toLowerCase()) !== -1) {
                    var gnContainer = groupNames[j].closest('.PotColumnName') || groupNames[j].parentElement;
                    return { sectionEl: groupNames[j], container: gnContainer };
                }
            }

            // Method 3: generic text fallback
            var allEls = document.querySelectorAll('button, div, span');
            for (var k = 0; k < allEls.length; k++) {
                var el = allEls[k];
                var direct = '';
                for (var n = 0; n < el.childNodes.length; n++) {
                    if (el.childNodes[n].nodeType === 3) direct += el.childNodes[n].textContent;
                }
                if (direct.trim().toLowerCase() === SECTION_NAME.toLowerCase()) {
                    return { sectionEl: el, container: el.parentElement };
                }
            }
            await sleep(1000);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════
    //  CLICK "ADD TASK" BUTTON
    // ═══════════════════════════════════════════════════════
    async function clickAddTask(section, statusEl) {
        var container = section.container;
        setStatus(statusEl, '🖱️ Hovering to reveal "Add task"...', 'info');
        hoverOn(container);
        hoverOn(section.sectionEl);
        await sleep(800);

        var addSelectors = [
            '.PotColumnName-addTaskButton', '.PotColumnName-addButton',
            '[class*="addTask"]', '[class*="AddTask"]',
            'button[aria-label*="Add task" i]', 'button[aria-label*="add a task" i]',
        ];

        for (var s = 0; s < addSelectors.length; s++) {
            var btn = container ? container.querySelector(addSelectors[s]) : null;
            if (!btn && container && container.parentElement) {
                btn = container.parentElement.querySelector(addSelectors[s]);
            }
            if (btn) { LOG('Add button found'); humanClick(btn); return true; }
        }

        var allBtns = document.querySelectorAll('button');
        for (var b = 0; b < allBtns.length; b++) {
            var lab = (allBtns[b].getAttribute('aria-label')||'').toLowerCase();
            if (lab.includes('add task') || lab.includes('add a task')) {
                humanClick(allBtns[b]);
                return true;
            }
        }

        humanClick(section.sectionEl);
        await sleep(400);
        section.sectionEl.dispatchEvent(new KeyboardEvent('keydown',
            {key:'Enter', keyCode:13, bubbles:true}));
        await sleep(600);
        return false;
    }

    // ═══════════════════════════════════════════════════════
    //  FILL TASK FORM
    // ═══════════════════════════════════════════════════════
    async function fillTaskForm(taskData, statusEl) {

        // ── Task name ──
        setStatus(statusEl, '✏️ Looking for task name field...', 'info');
        var nameField = null;
        for (var i = 0; i < 25; i++) {
            nameField =
                document.querySelector('[data-testid="title-input"]')        ||
                document.querySelector('.TaskPane-titleRow textarea')         ||
                document.querySelector('.TaskPane-titleRow input')            ||
                document.querySelector('textarea[placeholder*="name" i]')    ||
                document.querySelector('input[placeholder*="task name" i]')  ||
                document.querySelector('[aria-label*="task name" i]')        ||
                document.querySelector('[class*="TaskName"] textarea')       ||
                document.querySelector('[class*="TaskName"] input')          ||
                document.querySelector('.PotBasicTaskRow--isEditing input')  ||
                document.querySelector('.PotBasicTaskRow--isEditing textarea');
            var ae = document.activeElement;
            if (!nameField && ae && ae !== document.body &&
                (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA')) nameField = ae;
            if (nameField) { LOG('Name field found: attempt ' + (i+1)); break; }
            await sleep(300);
        }

        if (!nameField) { setStatus(statusEl, '❌ Name field not found.', 'err'); return false; }

        await typeInField(nameField, taskData.name);
        setStatus(statusEl, '✅ Name entered!', 'info');

        nameField.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', keyCode:9, bubbles:true}));
        await sleep(600);
        nameField.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:13, bubbles:true}));
        await sleep(1500);

        // ── Task Pane ──
        var taskPane = null;
        for (var j = 0; j < 15; j++) {
            taskPane =
                document.querySelector('.TaskPane')           ||
                document.querySelector('.SingleTaskPane')     ||
                document.querySelector('[class*="TaskPane"]') ||
                document.querySelector('[data-testid*="task-pane"]');
            if (taskPane) { LOG('Task Pane opened!'); break; }
            await sleep(500);
        }

        if (!taskPane) {
            var rows = document.querySelectorAll('.PotBasicTaskRow,[class*="TaskRow"],[role="row"]');
            for (var r = 0; r < rows.length; r++) {
                if ((rows[r].textContent||'').includes(taskData.name.substring(0,20))) {
                    humanClick(rows[r]);
                    await sleep(1000);
                    taskPane = document.querySelector('.TaskPane,[class*="TaskPane"]');
                    if (taskPane) break;
                }
            }
        }

        if (!taskPane) {
            setStatus(statusEl, '⚠️ Task created. Add description and assignee manually.', 'err');
            return true;
        }

        // ── Description ──
        var descFieldRef = null;
        if (taskData.desc) {
            setStatus(statusEl, '📝 Entering description...', 'info');
            await sleep(500);
            var descField =
                taskPane.querySelector('.ProseMirror')                                          ||
                taskPane.querySelector('[role="textbox"]')                                      ||
                taskPane.querySelector('[contenteditable="true"]')                              ||
                taskPane.querySelector('[data-testid="description"] [contenteditable="true"]') ||
                taskPane.querySelector('[aria-label*="description" i]');

            if (descField) {
                descFieldRef = descField;
                humanClick(descField);
                await sleep(400);
                await typeInField(descField, taskData.desc);
                setStatus(statusEl, '✅ Description entered!', 'info');
            }
        }

        // ── Assignee ──
        if (taskData.assignee) {
            setStatus(statusEl, '👤 Setting assignee: ' + taskData.assignee + '...', 'info');
            await sleep(600);
            var assigneeSet = false;

            var tokenBtn = taskPane.querySelector('.TaskPaneAssigneeToken div[role="button"]') ||
                           taskPane.querySelector('.TaskPaneAssigneeToken');
            if (!tokenBtn) {
                var allDivs = taskPane.querySelectorAll('div[role="button"]');
                for (var d = 0; d < allDivs.length; d++) {
                    var dTxt = (allDivs[d].textContent||'').trim();
                    if (dTxt === 'No assignee' || dTxt === 'Assignee') {
                        tokenBtn = allDivs[d]; break;
                    }
                }
            }

            if (tokenBtn) {
                humanClick(tokenBtn);
                await sleep(1000);

                var searchInput = null;
                for (var si = 0; si < 20; si++) {
                    var allInputs = document.querySelectorAll('input[type="text"],input:not([type])');
                    for (var ai = 0; ai < allInputs.length; ai++) {
                        var inp = allInputs[ai];
                        var rect = inp.getBoundingClientRect();
                        var ph  = (inp.placeholder||'').toLowerCase();
                        var al  = (inp.getAttribute('aria-label')||'').toLowerCase();
                        var cls = (typeof inp.className==='string' ? inp.className : '').toLowerCase();
                        if (rect.width > 0 && rect.height > 0 && (
                            ph.includes('name') || ph.includes('search') || ph.includes('type') ||
                            al.includes('assign') || al.includes('search') ||
                            cls.includes('tokenizer') || cls.includes('assign') || cls.includes('typeahead')
                        )) { searchInput = inp; break; }
                    }
                    var act = document.activeElement;
                    if (!searchInput && act && act.tagName==='INPUT' &&
                        act.getBoundingClientRect().width > 0) searchInput = act;
                    if (searchInput) { LOG('Assignee input found: attempt ' + (si+1)); break; }
                    await sleep(200);
                }

                if (searchInput) {
                    await typeInField(searchInput, taskData.assignee);
                    await sleep(1500);

                    var result = null;
                    for (var fr = 0; fr < 10; fr++) {
                        result =
                            document.querySelector('[role="option"]') ||
                            document.querySelector('[role="listbox"] > *:first-child') ||
                            document.querySelector('[class*="UserAutocomplete"] [role="option"]') ||
                            document.querySelector('[class*="Typeahead"] [role="option"]') ||
                            document.querySelector('[class*="Autocomplete"] [role="option"]') ||
                            document.querySelector('[id*="typeahead-item"]');
                        if (result) break;
                        await sleep(250);
                    }

                    if (result) {
                        humanClick(result);
                        await sleep(500);
                        assigneeSet = true;
                        setStatus(statusEl, '✅ Assigned to: ' + taskData.assignee, 'info');
                    } else {
                        searchInput.dispatchEvent(new KeyboardEvent('keydown',
                            {key:'ArrowDown', keyCode:40, bubbles:true}));
                        await sleep(300);
                        searchInput.dispatchEvent(new KeyboardEvent('keydown',
                            {key:'Enter', keyCode:13, bubbles:true}));
                        await sleep(600);
                        var paneText = (taskPane.textContent||'').toLowerCase();
                        if (paneText.indexOf(taskData.assignee.toLowerCase()) !== -1 &&
                            paneText.indexOf('no assignee') === -1) {
                            assigneeSet = true;
                            setStatus(statusEl, '✅ Assigned to: ' + taskData.assignee, 'info');
                        }
                    }
                }
            }

            if (!assigneeSet && descFieldRef) {
                humanClick(descFieldRef);
                await sleep(400);
                descFieldRef.dispatchEvent(new KeyboardEvent('keydown',
                    {key:'Home', ctrlKey:true, bubbles:true}));
                await sleep(200);
                document.execCommand('insertText', false,
                    '👤 ASSIGNEE: ' + taskData.assignee + '\n━━━━━━━━━━━━\n\n');
                await sleep(300);
                setStatus(statusEl,
                    '⚠️ Task created! Click "No assignee" and search: ' + taskData.assignee,
                    'err'
                );
            } else if (!assigneeSet) {
                setStatus(statusEl,
                    '⚠️ Please assign manually to: ' + taskData.assignee, 'err');
            }
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════
    //  MAIN WORKFLOW
    // ═══════════════════════════════════════════════════════
    async function createTask(taskData, statusEl, createBtn) {
        createBtn.disabled = true;
        createBtn.innerHTML = '<span class="mv-spin"></span>Creating...';

        try {
            setStatus(statusEl, '⏳ Waiting for Asana to load...', 'info');
            await sleep(WAIT_READY_MS);

            var section = await findSection(statusEl);
            if (!section) {
                setStatus(statusEl,
                    '❌ Section "' + SECTION_NAME + '" not found. ' +
                    'Make sure it is visible on the page.', 'err');
                createBtn.disabled = false;
                createBtn.textContent = '🚀 Retry';
                return;
            }

            setStatus(statusEl, '✅ Section found! Clicking "Add task"...', 'info');
            await clickAddTask(section, statusEl);
            await sleep(800);

            var success = await fillTaskForm(taskData, statusEl);

            if (success) {
                setStatus(statusEl, '🎉 Task created successfully in Asana!', 'ok');
                markDone(taskData.commentId || taskData.name);
                sessionStorage.removeItem(SESSION_KEY);
                setTimeout(function() {
                    var ov = document.getElementById('mv-ov');
                    if (ov) ov.remove();
                }, 3500);
            } else {
                createBtn.disabled = false;
                createBtn.textContent = '🚀 Retry';
            }

        } catch(err) {
            LOG('Error: ' + err.message);
            setStatus(statusEl, '❌ Error: ' + err.message, 'err');
            createBtn.disabled = false;
            createBtn.textContent = '🚀 Retry';
        }
    }

    // ═══════════════════════════════════════════════════════
    //  CONFIRMATION DIALOG
    // ═══════════════════════════════════════════════════════
    function showDialog(taskData) {
        var existing = document.getElementById('mv-ov');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'mv-ov';
        var box = document.createElement('div');
        box.id = 'mv-box';

        box.innerHTML =
            '<h2>' +
            '<svg width="26" height="26" viewBox="0 0 32 32" fill="none">' +
            '<circle cx="16" cy="8" r="6" fill="#f06a35"/>' +
            '<circle cx="7" cy="23" r="6" fill="#f06a35"/>' +
            '<circle cx="25" cy="23" r="6" fill="#f06a35"/>' +
            '</svg>Create Task from MyVoice</h2>' +
            '<p>Review the task details and click "Create Task Now":</p>' +
            '<div class="mv-prev">' +
            '<strong>📌 Name:</strong><br>' +
            '<span style="font-size:13px;color:#333">' + esc(taskData.name) + '</span><br><br>' +
            '<strong>📝 Description:</strong><br>' +
            '<span style="white-space:pre-wrap;font-size:11px;color:#555">' + esc(taskData.desc) + '</span><br><br>' +
            '<strong>👤 Assignee:</strong> ' +
            (taskData.assignee
                ? '<span style="color:#f06a35;font-weight:700">' + esc(taskData.assignee) + '</span>'
                : '<em style="color:#999">not specified</em>') + '<br>' +
            '<strong>📂 Section:</strong> ' + esc(SECTION_NAME) +
            '</div>' +
            '<div class="mv-fl">' +
            '<label>Edit Assignee if needed</label>' +
            '<input type="text" id="mv-assignee-edit" value="' + esc(taskData.assignee||'') + '" ' +
            'placeholder="Amazon login (e.g. franrago)"/>' +
            '</div>' +
            '<div class="mv-acts">' +
            '<button class="mv-cancel" id="mv-cancel">Cancel</button>' +
            '<button class="mv-create" id="mv-create">🚀 Create Task Now</button>' +
            '</div>' +
            '<div id="mv-status"></div>';

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        var statusEl  = document.getElementById('mv-status');
        var createBtn = document.getElementById('mv-create');

        document.getElementById('mv-cancel').onclick = function() {
            overlay.remove();
            sessionStorage.removeItem(SESSION_KEY);
        };
        createBtn.onclick = function() {
            var input = document.getElementById('mv-assignee-edit');
            if (input) taskData.assignee = input.value.trim();
            createTask(taskData, statusEl, createBtn);
        };
    }

    // ═══════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════
    function init() {
        injectStyles();
        LOG('Script Asana Universal v3.7 init');

        var taskData = null;
        try {
            var raw = sessionStorage.getItem(SESSION_KEY);
            if (raw) taskData = JSON.parse(raw);
        } catch(e) { LOG('sessionStorage error: ' + e.message); }

        if (!taskData) { LOG('No task in queue.'); return; }

        var doneIds = getDoneIds();
        var taskId  = taskData.commentId || taskData.name;
        if (doneIds.indexOf(taskId) !== -1) {
            LOG('Task already created, skipping.');
            sessionStorage.removeItem(SESSION_KEY);
            return;
        }

        // Override section name from task data if provided
        if (taskData.sectionName) {
            SECTION_NAME = taskData.sectionName;
            LOG('Section target: ' + SECTION_NAME);
        }

        LOG('Task ready: ' + taskData.name);
        showDialog(taskData);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    } else {
        setTimeout(init, 1500);
    }

})();
