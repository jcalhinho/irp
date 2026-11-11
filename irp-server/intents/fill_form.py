"""Intent: fill_form — Formulaire interactif (contact, inscription, commande)."""

def build(form_id="contact"):
    """Construit un intent fill_form."""
    forms = {
        "contact": {
            "id": "contact-form",
            "title": "Contactez-nous",
            "description": "Envoyez-nous un message, nous répondons sous 24h.",
            "fields": [
                {"id": "name", "label": "Nom complet", "type": "text", "required": True, "placeholder": "Jean Dupont"},
                {"id": "email", "label": "Email", "type": "email", "required": True, "placeholder": "jean@example.com", "validation": "email"},
                {"id": "subject", "label": "Sujet", "type": "select", "required": True, "options": ["Question produit", "Support technique", "Partenariat", "Autre"]},
                {"id": "message", "label": "Message", "type": "textarea", "required": True, "placeholder": "Votre message...", "validation": "min_length:10"},
                {"id": "newsletter", "label": "Recevoir la newsletter", "type": "checkbox", "required": False},
            ],
            "submit": {"label": "Envoyer le message", "href": "/api/contact", "method": "POST"},
            "cancel": {"label": "Annuler", "href": "/"},
        },
        "signup": {
            "id": "signup-form",
            "title": "Créer un compte",
            "description": "Rejoignez IRP en 30 secondes.",
            "fields": [
                {"id": "name", "label": "Nom complet", "type": "text", "required": True, "placeholder": "Jean Dupont"},
                {"id": "email", "label": "Email", "type": "email", "required": True, "placeholder": "jean@example.com"},
                {"id": "password", "label": "Mot de passe", "type": "password", "required": True, "validation": "min_length:8"},
                {"id": "company", "label": "Entreprise", "type": "text", "required": False, "placeholder": "ACME Inc."},
                {"id": "plan", "label": "Plan", "type": "radio", "required": True, "options": ["Starter (gratuit)", "Pro (29€/mois)", "Enterprise"]},
                {"id": "terms", "label": "J'accepte les conditions d'utilisation", "type": "checkbox", "required": True},
            ],
            "submit": {"label": "Créer mon compte", "href": "/api/signup", "method": "POST"},
            "cancel": {"label": "Déjà inscrit ? Se connecter", "href": "/login"},
        },
        "checkout": {
            "id": "checkout-form",
            "title": "Finaliser la commande",
            "description": "MacBook Pro 16\" — 2799€",
            "fields": [
                {"id": "full_name", "label": "Nom complet", "type": "text", "required": True},
                {"id": "address", "label": "Adresse", "type": "text", "required": True},
                {"id": "city", "label": "Ville", "type": "text", "required": True},
                {"id": "postal_code", "label": "Code postal", "type": "text", "required": True, "validation": "postal_code"},
                {"id": "country", "label": "Pays", "type": "select", "required": True, "options": ["France", "Belgique", "Suisse", "Luxembourg", "Canada"]},
                {"id": "card_number", "label": "Numéro de carte", "type": "text", "required": True, "placeholder": "4242 4242 4242 4242", "validation": "card_number"},
                {"id": "card_expiry", "label": "Expiration", "type": "text", "required": True, "placeholder": "MM/AA"},
                {"id": "card_cvc", "label": "CVC", "type": "text", "required": True, "placeholder": "123"},
            ],
            "submit": {"label": "Payer 2799€", "href": "/api/checkout", "method": "POST"},
            "cancel": {"label": "Retour au panier", "href": "/cart"},
        },
    }

    form = forms.get(form_id, forms["contact"])

    return {
        "irp": {
            "version": "1.0",
            "intent": "fill_form",
            "data": form,
            "constraints": {
                "must_show": ["title", "fields", "submit"],
                "priority": "clarity",
                "content_type": "interactive",
            },
            "context_hints": {"cacheable": False, "ttl": 0},
            "metadata": {"title": f"{form['title']} — IRP Demo", "lang": "fr"},
        }
    }
