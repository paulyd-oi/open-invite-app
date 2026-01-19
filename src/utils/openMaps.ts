import { Linking, Platform } from "react-native";

type OpenMapsArgs =
  | { lat: number; lng: number; label?: string }
  | { query: string };

export function openMaps(args: OpenMapsArgs) {
  const url =
    "lat" in args
      ? Platform.select({
          ios: `http://maps.apple.com/?ll=${args.lat},${args.lng}${
            args.label ? `&q=${encodeURIComponent(args.label)}` : ""
          }`,
          android: `https://www.google.com/maps/search/?api=1&query=${args.lat},${args.lng}`,
        })
      : Platform.select({
          ios: `http://maps.apple.com/?q=${encodeURIComponent(args.query)}`,
          android: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            args.query
          )}`,
        });

  if (url) Linking.openURL(url);
}
