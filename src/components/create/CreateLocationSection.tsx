import React from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { MapPin, Search, ArrowRight, X } from "@/ui/icons";
import type { PlaceSuggestion } from "./placeSearch";

interface CreateLocationSectionProps {
  selectedPlace: PlaceSuggestion | null;
  showLocationSearch: boolean;
  locationQuery: string;
  location: string;
  placeSuggestions: PlaceSuggestion[];
  isSearchingPlaces: boolean;
  isDark: boolean;
  themed: boolean;
  glassSurface: string;
  glassBorder: string;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
  onSelectPlace: (place: PlaceSuggestion) => void;
  onLocationInputChange: (text: string) => void;
  onLocationFocus: () => void;
  onClearPlace: () => void;
  onCloseSearch: () => void;
  onOpenSearch: () => void;
}

export function CreateLocationSection({
  selectedPlace,
  showLocationSearch,
  locationQuery,
  location,
  placeSuggestions,
  isSearchingPlaces,
  isDark,
  themed,
  glassSurface,
  glassBorder,
  glassText,
  glassSecondary,
  glassTertiary,
  onSelectPlace,
  onLocationInputChange,
  onLocationFocus,
  onClearPlace,
  onCloseSearch,
  onOpenSearch,
}: CreateLocationSectionProps) {
  return (
    <>
      <Text style={{ color: glassTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" }} className="mb-1.5 ml-1">5. Location</Text>

      {/* Selected Place Display */}
      {selectedPlace && !showLocationSearch ? (
        <Pressable
          onPress={onOpenSearch}
          className="rounded-xl mb-4 p-4"
          style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: themed ? glassBorder : "#4ECDC440" }}
        >
          <View className="flex-row items-start">
            <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#4ECDC420" }}>
              <MapPin size={20} color="#4ECDC4" />
            </View>
            <View className="flex-1">
              <Text style={{ color: glassText }} className="font-semibold">{selectedPlace.name}</Text>
              <Text style={{ color: glassSecondary }} className="text-sm mt-1">{selectedPlace.address}</Text>
            </View>
            <Pressable
              onPress={onClearPlace}
              className="p-1"
            >
              <X size={18} color={glassTertiary} />
            </Pressable>
          </View>
        </Pressable>
      ) : (
        <View className="mb-4">
          {/* Search Input */}
          <View className="rounded-xl flex-row items-center px-4" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
            <Search size={18} color={glassTertiary} />
            <TextInput
              testID="create-input-location"
              value={showLocationSearch ? locationQuery : location}
              onChangeText={onLocationInputChange}
              onFocus={onLocationFocus}
              placeholder="Search for a place..."
              placeholderTextColor={glassTertiary}
              className="flex-1 p-4"
              style={{ color: glassText }}
            />
            {isSearchingPlaces && (
              <ActivityIndicator size="small" color="#4ECDC4" />
            )}
          </View>

          {/* Place Suggestions */}
          {showLocationSearch && placeSuggestions.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(200)}
              className="rounded-xl mt-2 overflow-hidden"
              style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
            >
              {placeSuggestions.map((place, index) => (
                <Pressable
                  key={`${place.id}-${index}`}
                  onPress={() => onSelectPlace(place)}
                  className="p-4 flex-row items-center"
                  style={{ borderBottomWidth: index < placeSuggestions.length - 1 ? 1 : 0, borderBottomColor: glassBorder }}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                    {index === 0 ? (
                      <ArrowRight size={18} color="#4ECDC4" />
                    ) : (
                      <MapPin size={18} color={glassTertiary} />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: glassText }} className="font-medium">{place.name}</Text>
                    <Text style={{ color: glassSecondary }} className="text-sm" numberOfLines={1}>
                      {place.address}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          )}

          {/* Close search / use custom location */}
          {showLocationSearch && (
            <Pressable
              onPress={onCloseSearch}
              className="mt-2 rounded-xl p-3 flex-row items-center justify-center"
              style={{
                backgroundColor: glassSurface,
                borderWidth: 1,
                borderColor: glassBorder,
              }}
            >
              <Text style={{ color: glassText }} className="font-medium">
                {locationQuery && !selectedPlace ? "Use custom location" : "Close"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}
