
-- Query to find Nehil Jain's schedules
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    ea.id as email_account_id,
    ea.email as email_account_email,
    s.id as schedule_id,
    s."intervalDays",
    s."daysOfWeek",
    s."timeOfDay",
    s."lastOccurrenceAt",
    s."nextOccurrenceAt",
    s."createdAt" as schedule_created_at
FROM "User" u
LEFT JOIN "EmailAccount" ea ON u.id = ea."userId"
LEFT JOIN "Schedule" s ON ea.id = s."emailAccountId"
WHERE u.email = 'jain.nehil@gmail.com'
ORDER BY s."timeOfDay" ASC;

