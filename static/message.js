/* exported showMessage */

/* ============================================
   MESSAGE BAR
   ============================================ */

const messageArea = document.getElementById("message");

//Show message, then clear after a few seconds.
function showMessage(text, tone) {
    messageArea.textContent = text;
    messageArea.className = "message-" + (tone || "error");

    setTimeout(function () {
        messageArea.textContent = "";
        messageArea.className = "";
    }, 3000);
}