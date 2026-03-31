# Stripe — développement local

Guide rapide pour tester **Checkout**, **webhooks** et **portefeuille** Hive sans déployer en production.

## Prérequis

- Compte [Stripe](https://stripe.com) (mode **test**).
- [Stripe CLI](https://stripe.com/docs/stripe-cli) installée (`stripe --version`).
- Hive en local : `app/` avec Postgres + Redis, `npm run dev` sur le port utilisé par `AUTH_URL` (souvent `http://localhost:3000`).

## Variables d’environnement (`app/.env.local`)

| Variable | Rôle |
|----------|------|
| `STRIPE_SECRET_KEY` | Clé secrète **test** (`sk_test_…`) — Checkout / portail |
| `STRIPE_WEBHOOK_SECRET` | Secret de signature des webhooks — voir étape « écoute » ci-dessous |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | (Optionnel) Price récurrent `price_…` pour le bouton « Subscribe » |
| `AUTH_URL` | URL publique utilisée pour les URLs de retour Checkout (ex. `http://localhost:3000`) |

## 1. Transférer les webhooks vers Hive

Dans un terminal séparé (avec Stripe CLI connectée : `stripe login`) :

```bash
cd app
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

La CLI affiche un **signing secret** du type `whsec_…`. Copiez-le dans **`STRIPE_WEBHOOK_SECRET`** puis redémarrez `npm run dev`.

Sans cette étape, les paiements passent mais Hive ne reçoit pas les événements signés (pas de crédit portefeuille).

## 2. Événements à activer (Dashboard)

Dans **Developers → Webhooks** (point de terminaison créé par `stripe listen` ou votre URL), assurez-vous que les types utiles Hive sont livrés, notamment :

- `checkout.session.completed`
- `payment_intent.succeeded`
- `invoice.paid` (abonnements / facturation)
- `refund.created`

`stripe listen` envoie en général tous les événements vers le forwarder.

## 3. Tester un paiement

1. Ouvrez **Settings → Billing**, définissez un montant, cliquez **Pay with Stripe**.
2. Utilisez une carte de test, par ex. `4242 4242 4242 4242`, une date future, un CVC quelconque.
3. Après succès, le solde est mis à jour quand Stripe envoie les webhooks (quelques secondes).

## 4. Abonnement (optionnel)

Créez un **Product** + **Price** récurrent dans le Dashboard (mode test). Mettez l’id `price_…` dans `STRIPE_SUBSCRIPTION_PRICE_ID`. Le crédit wallet pour les factures récurrents passe par l’événement **`invoice.paid`** (résolution utilisateur via `users.stripe_customer_id` après `checkout.session.completed`).

## 5. Dépannage

| Symptôme | Piste |
|----------|--------|
| 503 sur `/api/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` absent ou ne correspond pas au secret du `stripe listen` actif |
| Paiement OK mais solde 0 | Webhooks non reçus (CLI arrêtée, mauvais port, secret incorrect) |
| Double crédit | Ne pas traiter manuellement à la fois `payment_intent` et `invoice` pour le même flux ; Hive ignore les PI liés à une facture et crédite via `invoice.paid` |

Référence opérateur : [`PRODUCTION.md`](./PRODUCTION.md) §2.1.
