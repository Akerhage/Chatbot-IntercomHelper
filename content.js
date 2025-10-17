// content.js - Version 4.2 - Med korrekt svarsruta-adress
// Detta är den slutgiltiga versionen som använder de korrekta adresserna för
// både knapp-placering och för att skriva in det färdiga svaret.

(function() {
  // --- HUVUDFUNKTIONER (UPPDATERAD) ---

  function findLastCustomerMessage() {
    const messageBlocks = document.querySelectorAll('div[data-intercom-target="conversation-stream-content-part"]');
    if (messageBlocks.length === 0) return null;

    for (let i = messageBlocks.length - 1; i >= 0; i--) {
      const block = messageBlocks[i];
      const isAdminMessage = block.querySelector('[data-testid="admin-avatar-name"]');
      if (!isAdminMessage) {
        const textContainer = block.querySelector('.intercom-interblocks-html');
        if (textContainer && textContainer.textContent) {
            const questionText = textContainer.textContent.trim();
            console.log("Senaste kundfråga:", questionText);
            return questionText;
        }
      }
    }
    return null;
  }

  // UPPDATERAD FUNKTION: Hittar den nya svarsrutan
  function insertReply(text) {
    // Den nya, korrekta adressen till svarsrutan du hittade!
    const replyTextarea = document.querySelector('div.ProseMirror.embercom-prosemirror-composer-editor');
    
    if (replyTextarea) {
      replyTextarea.innerHTML = text.replace(/\n/g, '<p></p>');
      replyTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    } else {
      alert("Kunde inte hitta svarsrutan i Intercom.");
    }
  }

  // --- KNAPPEN & ANVÄNDARGRÄNSSNITTET ---

  function injectButton() {
    const composerToolbar = document.querySelector('div.inbox2__composer__container div.flex-row.justify-between.items-end');
    const leftSideOfToolbar = composerToolbar ? composerToolbar.querySelector('div.flex-row') : null;

    if (!leftSideOfToolbar || document.getElementById('mda-ai-button')) {
      return;
    }

    const aiButton = document.createElement('button');
    aiButton.id = 'mda-ai-button';
    aiButton.textContent = '🤖 Skapa AI-svar';
    aiButton.style.padding = '4px 10px';
    aiButton.style.border = '1px solid #ccc';
    aiButton.style.borderRadius = '6px';
    aiButton.style.marginLeft = '8px';
    aiButton.style.cursor = 'pointer';
    aiButton.style.backgroundColor = '#f5f5f5';
    aiButton.style.fontSize = '14px';
    aiButton.style.whiteSpace = 'nowrap';
    aiButton.title = 'Läs senaste frågan och skapa ett svar från kunskapsbasen';

    aiButton.addEventListener('click', async () => {
      aiButton.textContent = '🧠 Tänker...';
      aiButton.disabled = true;

      const question = findLastCustomerMessage();
      if (!question) {
        alert('Kunde inte hitta en kundfråga att svara på.');
        aiButton.textContent = '🤖 Skapa AI-svar';
        aiButton.disabled = false;
        return;
      }
      chrome.runtime.sendMessage({ action: 'generateReply', message: question });
    });
    
    leftSideOfToolbar.appendChild(aiButton);
  }

  // --- LYSSNARE & STARTPUNKT ---

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const aiButton = document.getElementById('mda-ai-button');
    if (request.action === 'insertReply' && request.text) {
      insertReply(request.text);
      if (aiButton) {
        aiButton.textContent = '🤖 Skapa AI-svar';
        aiButton.disabled = false;
      }
    }
    if (request.action === 'aiError') {
      alert('Ett fel inträffade:\n' + request.message);
      if (aiButton) {
        aiButton.textContent = '🤖 Försök igen';
        aiButton.disabled = false;
      }
    }
  });

  const observer = new MutationObserver((mutations) => {
    setTimeout(injectButton, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log("Intercom AI Helper (Content Script v4.2) är aktiv.");
})();