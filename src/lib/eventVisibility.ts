export function shouldShowInSocial(event: any): boolean {
  return !event?.isBusy;
}

export function filterSocialEvents<T>(events: T[]): T[] {
  return (events ?? []).filter((e: any) => shouldShowInSocial(e));
}
