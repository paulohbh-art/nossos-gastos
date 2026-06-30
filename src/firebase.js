import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuração do projeto Firebase "nossos-gastos". O "apiKey" abaixo NÃO é um
// segredo (a própria documentação do Firebase confirma isso) — quem protege os
// dados de verdade são as Regras de Segurança do Firestore (veja o README.md).
const firebaseConfig = {
  apiKey: "AIzaSyCy5hZpnU0DuuY6Rp8XrrEpOOHnU_R7TBg",
  authDomain: "nossos-gastos-7dc8f.firebaseapp.com",
  projectId: "nossos-gastos-7dc8f",
  storageBucket: "nossos-gastos-7dc8f.firebasestorage.app",
  messagingSenderId: "879694382891",
  appId: "1:879694382891:web:1dfd5e6ebeef47c5ca276e",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
