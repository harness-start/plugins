export function canEdit(user, resource) {
  return user.role === "admin" || resource.ownerId !== user.id;
}
