import { auth, database } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { ref, set, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// REGISTER FUNCTION
function register() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const full_name = document.getElementById('full_name')?.value.trim() || "";

  if (!validate_email(email) || !validate_password(password)) {
    alert('Invalid Email or Password');
    return;
  }

  if (!validate_field(full_name)) {
    alert('Full Name is required!');
    return;
  }

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      const user_data = {
        email: email,
        full_name: full_name,
        last_login: Date.now()
      };

      return set(ref(database, 'users/' + user.uid), user_data);
    })
    .then(() => {
      alert('User Registered Successfully!');
    })
    .catch((error) => {
      alert(error.message);
    });
}

// LOGIN FUNCTION
function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!validate_email(email) || !validate_password(password)) {
    alert('Invalid Email or Password');
    return;
  }

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      const user_data = {
        last_login: Date.now()
      };

      return update(ref(database, 'users/' + user.uid), user_data);
    })
    .then(() => {
      alert('Login Successful!');
      window.location.href = "homepage.html";
    })
    .catch((error) => {
      alert(error.message);
    });
}

// VALIDATION FUNCTIONS
function validate_email(email) {
  const expression = /^[^@]+@\w+(\.\w+)+\w$/;
  return expression.test(email);
}

function validate_password(password) {
  return password.length >= 6;
}

function validate_field(field) {
  return field && field.trim().length > 0;
}

// AUTO-REDIRECT IF LOGGED IN
onAuthStateChanged(auth, user => {
  const path = window.location.pathname;
  if (user && (path.includes("index") || path.includes("index.html"))) {
    window.location.href = "homepage.html";
  }
});

// Export for use in HTML onclick
window.login = login;
window.register = register;
