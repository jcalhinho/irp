"""Intent: show_chat — Interface de conversation avec messages."""

def build():
    return {
        "irp": {
            "version": "1.0",
            "intent": "show_chat",
            "data": {
                "id": "support-chat",
                "title": "Support IRP",
                "messages": [
                    {"id": "m1", "role": "assistant", "content": "Bonjour ! Je suis l'assistant IRP. Comment puis-je vous aider ?", "timestamp": "2026-11-10T14:00:00Z"},
                    {"id": "m2", "role": "user", "content": "Comment fonctionne le fallback chain ?", "timestamp": "2026-11-10T14:01:00Z"},
                    {"id": "m3", "role": "assistant", "content": "Le model router essaie chaque renderer dans l'ordre : Chrome Prompt API (le plus rapide, ~200ms) → WebLLM (local, ~2-5s) → LFM3 (local, ONNX) → SGP API (distant, ~5-30s). Au premier succès, le rendu est injecté dans le DOM et caché localement.", "timestamp": "2026-11-10T14:01:30Z"},
                    {"id": "m4", "role": "user", "content": "Et si aucun modèle n'est disponible ?", "timestamp": "2026-11-10T14:02:00Z"},
                    {"id": "m5", "role": "assistant", "content": "Le client affiche un message d'erreur clair avec un bouton pour réessayer. En production, un fallback HTML statique minimal peut être servi par le serveur en dernier recours.", "timestamp": "2026-11-10T14:02:30Z"},
                ],
                "input": {"placeholder": "Écrivez votre message...", "endpoint": "/api/chat", "method": "POST"},
                "participants": [
                    {"id": "bot", "name": "IRP Assistant", "avatar": "bot"},
                    {"id": "user", "name": "Vous", "avatar": "user"},
                ],
            },
            "constraints": {
                "must_show": ["messages", "input"],
                "priority": "engagement",
                "content_type": "interactive",
            },
            "context_hints": {"cacheable": False, "ttl": 0},
            "metadata": {"title": "Chat — IRP Support", "lang": "fr"},
        }
    }
