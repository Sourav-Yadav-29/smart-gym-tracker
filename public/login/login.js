(function () {
  var roleInput = document.getElementById('role-input');
  var email = document.getElementById('email-input');
  var hints = { member: 'member1@ironpulse.com', trainer: 'trainer1@ironpulse.com', admin: 'admin@ironpulse.com' };

  window.setRole = function (role) {
    roleInput.value = role;
    document.querySelectorAll('.role').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.role === role));
    });
    email.placeholder = 'e.g. ' + hints[role];
  };

  window.togglePassword = function () {
    var input = document.getElementById('password-input');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    document.getElementById('eye-on').style.display = show ? 'none' : '';
    document.getElementById('eye-off').style.display = show ? '' : 'none';
    document.getElementById('eye-btn').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };

  window.toggleTheme = function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ip-theme', next); } catch (e) {}
  };

  var lastRecoveredEmail = '';
  var lastRecoveredPass = '';
  var lastRecoveredRole = 'member';

  window.openForgotModal = function () {
    var currentEmail = document.getElementById('email-input').value.trim();
    if (currentEmail) {
      document.getElementById('forgot-email').value = currentEmail;
    }
    document.getElementById('forgotError').style.display = 'none';
    document.getElementById('forgotFormState').style.display = 'block';
    document.getElementById('forgotSuccessState').style.display = 'none';
    document.getElementById('forgotModal').style.display = 'grid';
    setTimeout(function () {
      document.getElementById('forgot-email').focus();
    }, 50);
  };

  window.closeForgotModal = function (e) {
    if (e && e.target !== document.getElementById('forgotModal')) return;
    document.getElementById('forgotModal').style.display = 'none';
  };

  var ALLOWED_DOMAINS = [
    'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'yahoo.in', 'yahoo.co.uk', 'icloud.com', 'me.com',
    'proton.me', 'protonmail.com', 'zoho.com', 'ironpulse.com'
  ];

  window.setDevAccount = function (role, emailVal) {
    if (window.setRole) window.setRole(role);
    var emailInput = document.getElementById('email-input');
    var passInput = document.getElementById('password-input');
    if (emailInput) emailInput.value = emailVal;
    if (passInput) passInput.value = 'password123';
    if (passInput) passInput.focus();
  };

  window.handleForgotSubmit = async function (e) {
    e.preventDefault();
    var emailVal = document.getElementById('forgot-email').value.trim();
    var submitBtn = document.getElementById('forgotSubmitBtn');
    var errBox = document.getElementById('forgotError');
    var errText = document.getElementById('forgotErrorText');

    errBox.style.display = 'none';

    // Client-side domain validation
    var parts = emailVal.toLowerCase().split('@');
    if (parts.length !== 2 || ALLOWED_DOMAINS.indexOf(parts[1]) === -1) {
      errText.innerText = 'Only recognized providers (Gmail, Outlook, Yahoo, iCloud, Proton, Zoho, or IronPulse) are supported for credential delivery.';
      errBox.style.display = 'flex';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Verifying & Sending...</span>';

    try {
      var res = await fetch('/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: emailVal })
      });
      var data = await res.json();

      if (!res.ok || !data.success) {
        errText.innerText = data.error || 'Failed to dispatch credentials.';
        errBox.style.display = 'flex';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Send Credentials to Email</span>';
        return;
      }

      // Success
      lastRecoveredEmail = data.email;
      lastRecoveredRole = data.role || 'member';

      document.getElementById('forgotFormState').style.display = 'none';
      document.getElementById('forgotSuccessState').style.display = 'block';
      document.getElementById('forgotSuccessMsg').innerText = data.message;
      document.getElementById('dispatchedEmail').innerText = data.email;

      // Pre-fill email on sign in form so user only enters password received in inbox
      if (lastRecoveredRole && window.setRole) {
        window.setRole(lastRecoveredRole);
      }
      if (lastRecoveredEmail) {
        document.getElementById('email-input').value = lastRecoveredEmail;
      }
    } catch (err) {
      errText.innerText = 'Network error: ' + err.message;
      errBox.style.display = 'flex';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Send Credentials to Email</span>';
    }
  };

  setRole(roleInput.value || 'member');
})();
