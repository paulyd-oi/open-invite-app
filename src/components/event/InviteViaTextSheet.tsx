/**
 * InviteViaTextSheet — Multi-select contact picker → pre-composed SMS invite.
 *
 * Flow:
 *  1. Request contacts permission
 *  2. Show searchable contact list (filtered to those with phone numbers)
 *  3. Multi-select contacts
 *  4. Open SMS compose with pre-composed invite message to selected recipients
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Contacts from "expo-contacts";
import * as SMS from "expo-sms";
import * as Haptics from "expo-haptics";

import BottomSheet from "@/components/BottomSheet";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { devLog, devError } from "@/lib/devLog";
import { Search, Check, MessageCircle, UserPlus } from "@/ui/icons";
import { RADIUS } from "@/ui/layout";

interface InviteViaTextSheetProps {
  visible: boolean;
  onClose: () => void;
  smsBody: string;
  themeColor: string;
  onInviteSent?: (count: number) => void;
}

interface ContactItem {
  id: string;
  name: string;
  phone: string;
  initials: string;
}

export function InviteViaTextSheet({
  visible,
  onClose,
  smsBody,
  themeColor,
  onInviteSent,
}: InviteViaTextSheetProps) {
  const { colors, isDark } = useTheme();

  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // Load contacts when sheet opens
  useEffect(() => {
    if (!visible) {
      setSearch("");
      setSelected(new Set());
      return;
    }
    loadContacts();
  }, [visible]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });

      const parsed: ContactItem[] = [];
      for (const c of data) {
        if (!c.phoneNumbers?.length) continue;
        const phone = c.phoneNumbers[0].number ?? "";
        if (!phone) continue;
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
        const initials = (c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "");
        parsed.push({ id: c.id!, name, phone, initials: initials || "?" });
      }

      setContacts(parsed);
      setPermissionDenied(false);
    } catch (err) {
      devError("[InviteViaText] Error loading contacts:", err);
      safeToast.error("Could not load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [contacts, search]);

  const toggleContact = (id: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = useCallback(async () => {
    if (selected.size === 0) return;
    setSending(true);

    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        safeToast.error("SMS not available on this device");
        setSending(false);
        return;
      }

      const recipients = contacts
        .filter((c) => selected.has(c.id))
        .map((c) => c.phone);

      const { result } = await SMS.sendSMSAsync(recipients, smsBody);

      if (result === "sent" || result === "unknown") {
        // "unknown" on iOS means the compose sheet was dismissed — may have sent
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeToast.success(`Invited ${selected.size} people via text`);
        onInviteSent?.(selected.size);
        onClose();
      }
    } catch (err) {
      devError("[InviteViaText] SMS error:", err);
      safeToast.error("Could not open SMS");
    } finally {
      setSending(false);
    }
  }, [selected, contacts, smsBody, onClose, onInviteSent]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Invite via Text"
      heightPct={0.75}
    >
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 16 }}>
        {/* Permission denied state */}
        {permissionDenied && !loading && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
            <UserPlus size={40} color={colors.textTertiary} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", marginTop: 12 }}>
              Contacts access needed
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
              Allow access to your contacts to invite friends via text message.
            </Text>
            <Pressable
              onPress={loadContacts}
              style={{
                marginTop: 16,
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: RADIUS.lg,
                backgroundColor: themeColor,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Try Again</Text>
            </Pressable>
          </View>
        )}

        {/* Loading state */}
        {loading && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color={themeColor} />
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8 }}>Loading contacts...</Text>
          </View>
        )}

        {/* Contact list */}
        {!loading && !permissionDenied && (
          <>
            {/* Search */}
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              borderRadius: RADIUS.md,
              paddingHorizontal: 12,
              marginBottom: 12,
            }}>
              <Search size={16} color={colors.textTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search contacts..."
                placeholderTextColor={colors.textTertiary}
                style={{
                  flex: 1,
                  paddingVertical: Platform.OS === "ios" ? 12 : 8,
                  paddingHorizontal: 8,
                  fontSize: 15,
                  color: colors.text,
                }}
              />
            </View>

            {/* Selected count */}
            {selected.size > 0 && (
              <Text style={{ fontSize: 13, fontWeight: "600", color: themeColor, marginBottom: 8 }}>
                {selected.size} selected
              </Text>
            )}

            {/* List */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = selected.has(item.id);
                return (
                  <Pressable
                    onPress={() => toggleContact(item.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 4,
                      opacity: pressed ? 0.7 : 1,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                    })}
                  >
                    <EntityAvatar
                      initials={item.initials}
                      size={40}
                      backgroundColor={isSelected ? `${themeColor}20` : (isDark ? "#2C2C2E" : "#E5E7EB")}
                      foregroundColor={isSelected ? themeColor : colors.textSecondary}
                      fallbackIcon="person-outline"
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 1 }}>
                        {item.phone}
                      </Text>
                    </View>
                    <View style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? themeColor : "transparent",
                      borderWidth: isSelected ? 0 : 2,
                      borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
                    }}>
                      {isSelected && <Check size={14} color="#FFFFFF" />}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                    {search ? "No contacts found" : "No contacts with phone numbers"}
                  </Text>
                </View>
              }
            />

            {/* Send button */}
            <Pressable
              onPress={handleSend}
              disabled={selected.size === 0 || sending}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 14,
                borderRadius: RADIUS.lg,
                backgroundColor: selected.size > 0 ? themeColor : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                marginTop: 12,
                gap: 8,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MessageCircle size={18} color={selected.size > 0 ? "#FFFFFF" : colors.textTertiary} />
                  <Text style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: selected.size > 0 ? "#FFFFFF" : colors.textTertiary,
                  }}>
                    {selected.size > 0
                      ? `Send to ${selected.size} contact${selected.size !== 1 ? "s" : ""}`
                      : "Select contacts"}
                  </Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>
    </BottomSheet>
  );
}
