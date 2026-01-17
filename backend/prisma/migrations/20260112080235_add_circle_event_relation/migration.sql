-- AddForeignKey
ALTER TABLE "circle_event" ADD CONSTRAINT "circle_event_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
