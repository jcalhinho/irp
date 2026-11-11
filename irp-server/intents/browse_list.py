"""Intent: browse_list — Liste générique (todos, résultats, favoris)."""

def build(list_id="tasks"):
    """Construit un intent browse_list."""
    lists = {
        "tasks": {
            "title": "Mes tâches",
            "items": [
                {"id": "t1", "label": "Finaliser la spec IRP v1.0", "description": "JSON Schema + catalogue d'intents", "status": "done", "actions": [{"id": "edit", "label": "Modifier", "href": "/tasks/t1"}]},
                {"id": "t2", "label": "Coder le SDK Python", "description": "Factory helpers + décorateur @intent", "status": "done", "actions": [{"id": "edit", "label": "Modifier", "href": "/tasks/t2"}]},
                {"id": "t3", "label": "Coder le SDK JavaScript", "description": "IRPClient + renderers + cache", "status": "done", "actions": [{"id": "edit", "label": "Modifier", "href": "/tasks/t3"}]},
                {"id": "t4", "label": "Créer l'extension navigateur", "description": "Intercepter les réponses application/irp+json", "status": "in_progress", "actions": [{"id": "edit", "label": "Modifier", "href": "/tasks/t4"}]},
                {"id": "t5", "label": "Site de référence", "description": "Démo + documentation publique", "status": "pending", "actions": [{"id": "edit", "label": "Modifier", "href": "/tasks/t5"}]},
                {"id": "t6", "label": "Tests multi-device", "description": "Mobile, tablet, desktop, a11y", "status": "pending", "actions": [{"id": "edit", "label": "Modifier", "href": "/tasks/t6"}]},
            ],
            "empty_message": "Aucune tâche. Profitez-en !",
            "filters": [
                {"id": "status", "label": "Statut", "options": ["all", "pending", "in_progress", "done"]},
            ],
            "sortable": True,
        },
        "favorites": {
            "title": "Mes favoris",
            "items": [
                {"id": "f1", "label": "MacBook Pro 16\"", "description": "2799€", "status": "active", "actions": [{"id": "remove", "label": "Retirer", "href": "/favorites/f1/remove", "method": "POST"}]},
                {"id": "f2", "label": "Article: Le web qui se code lui-même", "description": "5 min de lecture", "status": "active", "actions": [{"id": "remove", "label": "Retirer", "href": "/favorites/f2/remove", "method": "POST"}]},
            ],
            "empty_message": "Aucun favori pour le moment.",
            "filters": [],
            "sortable": False,
        },
    }

    data = lists.get(list_id, lists["tasks"])

    return {
        "irp": {
            "version": "1.0",
            "intent": "browse_list",
            "data": data,
            "constraints": {
                "must_show": ["items"],
                "priority": "data_density",
                "content_type": "informational",
            },
            "context_hints": {"cacheable": True, "ttl": 60},
            "metadata": {"title": f"{data['title']} — IRP Demo", "lang": "fr"},
        }
    }
