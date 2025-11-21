# Charger l'Extension dans Chrome

L'extension est maintenant prête à être chargée dans Chrome ! Suivez ces étapes :

## ✅ Étapes pour charger l'extension

### 1. Ouvrir la page des extensions

Dans Chrome, naviguez vers :
```
chrome://extensions/
```

Ou via le menu : `⋮` (menu) → `Extensions` → `Gérer les extensions`

### 2. Activer le mode développeur

- Trouvez le toggle "Mode développeur" en haut à droite de la page
- Activez-le (il doit être bleu/violet)

### 3. Charger l'extension

- Cliquez sur le bouton **"Charger l'extension non empaquetée"**
- Naviguez jusqu'au dossier de ce projet
- Sélectionnez le dossier **`dist`**
- Cliquez sur "Sélectionner"

### 4. Vérifier l'installation

Vous devriez voir apparaître :

```
Crypto Wallet
Version 1.0.0
ID: [un identifiant unique]
```

Avec les icônes violettes en dégradé.

### 5. Épingler l'extension (recommandé)

- Cliquez sur l'icône puzzle (🧩) dans la barre d'outils Chrome
- Trouvez "Crypto Wallet"
- Cliquez sur l'icône d'épingle pour la garder visible

## 🎯 Première utilisation

1. **Cliquez sur l'icône de l'extension**
   - Elle devrait s'ouvrir dans un popup

2. **Créez votre wallet**
   - Choisissez "Create New Wallet"
   - Entrez un mot de passe (minimum 8 caractères)
   - **IMPORTANT** : Sauvegardez votre phrase de récupération !

3. **Testez avec la DApp de test**
   - Ouvrez `test-dapp.html` dans Chrome
   - Cliquez sur "Connecter le Wallet"
   - Testez les différentes fonctionnalités

## 🔄 Mise à jour après modification

Si vous modifiez le code :

1. Relancez le build :
   ```bash
   npm run build
   ```

2. Retournez sur `chrome://extensions/`

3. Cliquez sur l'icône de rechargement (🔄) de l'extension "Crypto Wallet"

4. Rechargez les pages où vous testez (F5)

## ⚠️ Troubleshooting

### L'extension ne charge pas

**Erreur** : "Manifest file is missing or unreadable"
- **Solution** : Assurez-vous de sélectionner le dossier `dist` et non le dossier racine

**Erreur** : "Could not load icon..."
- **Solution** : Les icônes ont été générées automatiquement. Si vous avez cette erreur, relancez :
  ```bash
  npm run build
  ```

### L'extension ne fonctionne pas

1. **Vérifier la console**
   - Sur `chrome://extensions/`, cliquez sur "Erreurs" sous l'extension
   - Regardez les erreurs dans la console

2. **Vérifier les permissions**
   - L'extension demande : `storage`, `unlimitedStorage`, `activeTab`
   - Chrome peut bloquer certaines permissions

3. **Recharger l'extension**
   - Cliquez sur le bouton de rechargement
   - Puis rechargez la page de test

### Le wallet ne se connecte pas aux DApps

1. **Vérifier que l'extension est activée**
   - Sur `chrome://extensions/`, vérifiez que le toggle est activé

2. **Recharger la page de la DApp**
   - Appuyez sur F5 pour recharger
   - Le script d'injection ne s'active qu'au chargement de la page

3. **Vérifier la console de la page**
   - Ouvrez les DevTools (F12)
   - Cherchez "Crypto Wallet provider injected"
   - Si absent, rechargez l'extension

## 📋 Checklist de vérification

Avant de tester, assurez-vous que :

- ✅ `npm install` a été exécuté
- ✅ `npm run build` a réussi sans erreurs
- ✅ Le dossier `dist/` existe et contient les fichiers
- ✅ Les icônes sont présentes dans `dist/icons/`
- ✅ L'extension est en mode développeur dans Chrome
- ✅ L'extension est activée (toggle bleu)

## 🎨 Icônes

Les icônes ont été générées automatiquement avec un dégradé violet (#667eea → #764ba2).

Pour régénérer les icônes :
```bash
npm run icons
```

Pour créer vos propres icônes personnalisées :
1. Créez 3 fichiers PNG : `icon16.png`, `icon48.png`, `icon128.png`
2. Placez-les dans `public/icons/`
3. Relancez `npm run build`

## 🚀 Prochaines étapes

1. **Testez toutes les fonctionnalités**
   - Création de wallet
   - Import de wallet
   - Signature de messages
   - Changement de réseau

2. **Testez avec de vraies DApps**
   - Uniswap (sur testnet)
   - OpenSea (sur testnet)
   - Autres DApps Web3

3. **Développez de nouvelles fonctionnalités**
   - Support des tokens ERC-20
   - Historique de transactions
   - Carnet d'adresses
   - etc.

## ⚡ Mode développement

Pour le développement actif :

```bash
npm run dev
```

Cela lancera webpack en mode watch. À chaque modification :
1. Webpack recompile automatiquement
2. Rechargez l'extension sur `chrome://extensions/`
3. Rechargez la page de test

## 🔒 Sécurité - Rappel important

**Ceci est un wallet de démonstration !**

- ❌ N'utilisez PAS pour de vraies crypto-monnaies de valeur
- ❌ N'importez PAS votre vrai wallet
- ✅ Utilisez uniquement sur des testnets
- ✅ Créez un nouveau wallet pour tester

Pour un usage réel, utilisez des wallets audités et reconnus.

---

**Vous êtes prêt !** L'extension est chargée et fonctionnelle. Bon développement ! 🚀
