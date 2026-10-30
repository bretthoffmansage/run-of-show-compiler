"use client";

/** Two-step delete: the browser confirm prevents a stray click from removing an event. */
export function DeleteEventButton({ eventId, eventName, action }: { eventId: string; eventName: string; action: (form: FormData) => void }) {
  return (
    <form action={action} onSubmit={event => {
      if (!window.confirm(`Delete the event "${eventName}"? It will disappear from the app and stop syncing. Its playbook sheet stays in Google Drive.`)) event.preventDefault();
    }}>
      <input type="hidden" name="eventId" value={eventId} />
      <button type="submit" className="quiet-button danger">Delete event</button>
    </form>
  );
}
