"""Intent: show_pricing — Tableau de tarifs avec comparaison."""

def build():
    return {
        "irp": {
            "version": "1.0",
            "intent": "show_pricing",
            "data": {
                "title": "Tarifs IRP",
                "plans": [
                    {
                        "id": "starter",
                        "name": "Starter",
                        "price": 0,
                        "currency": "EUR",
                        "period": "month",
                        "features": ["100 intents/mois", "1 projet", "Communauté", "Chrome Prompt API"],
                        "highlighted": False,
                        "cta": {"label": "Commencer", "href": "/form/signup"},
                    },
                    {
                        "id": "pro",
                        "name": "Pro",
                        "price": 29,
                        "currency": "EUR",
                        "period": "month",
                        "features": ["10K intents/mois", "10 projets", "Tous les renderers", "Cache IndexedDB", "Analytics", "Support email"],
                        "highlighted": True,
                        "cta": {"label": "Essai 14 jours", "href": "/form/signup?plan=pro"},
                    },
                    {
                        "id": "enterprise",
                        "name": "Enterprise",
                        "price": None,
                        "currency": "EUR",
                        "period": "month",
                        "features": ["Intents illimités", "Projets illimités", "Modèles on-premise", "SLA 99.9%", "Support dédié", "SSO/SAML"],
                        "highlighted": False,
                        "cta": {"label": "Nous contacter", "href": "/form/contact"},
                    },
                ],
                "billing_toggle": {"monthly": 29, "yearly": 290, "discount": "2 mois offerts"},
                "faq": [
                    {"question": "Puis-je changer de plan ?", "answer": "Oui, à tout moment depuis votre dashboard."},
                    {"question": "Quels modèles IA sont supportés ?", "answer": "Chrome Prompt API, WebLLM, LFM3, et tout LLM via API."},
                    {"question": "Y a-t-il une limite de bande passante ?", "answer": "Non. IRP réduit la bande passante de 50x par rapport au HTML classique."},
                ],
            },
            "constraints": {
                "must_show": ["plans"],
                "priority": "conversion",
                "content_type": "commercial",
            },
            "context_hints": {"cacheable": True, "ttl": 86400},
            "metadata": {"title": "Tarifs — IRP", "lang": "fr"},
        }
    }
