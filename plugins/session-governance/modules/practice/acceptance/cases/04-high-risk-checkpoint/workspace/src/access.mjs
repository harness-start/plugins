export function canAccess(user, record) {
  return user.role === "admin" || record.ownerId === user.id;
}
