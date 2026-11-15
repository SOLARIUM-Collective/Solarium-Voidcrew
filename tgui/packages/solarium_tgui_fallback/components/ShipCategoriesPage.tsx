import { useBackend } from 'tgui/backend';
import { Box, Button, Section, Stack } from 'tgui-core/components';

import {
  JobPriority,
  type PreferencesMenuData,
} from 'tgui/interfaces/PreferencesMenu/types';
import { useServerPrefs } from 'tgui/interfaces/PreferencesMenu/useServerPrefs';

const priorities = [
  { name: 'Off', value: null, color: 'transparent' },
  { name: 'Low', value: JobPriority.Low, color: 'red' },
  { name: 'Medium', value: JobPriority.Medium, color: 'yellow' },
  { name: 'High', value: JobPriority.High, color: 'green' },
];

export function ShipCategoriesPage() {
  const { act, data } = useBackend<PreferencesMenuData>();
  const serverData = useServerPrefs();

  // Get categories from server constant data (provided by middleware)
  const categories: string[] =
    serverData?.ship_categories?.ship_categories || [];
  // Get current preferences from UI data
  const categoryPreferences: Record<string, JobPriority> =
    data.ship_category_preferences || {};

  const handleSetPriority = (
    category: string,
    priority: JobPriority | null,
  ) => {
    act('set_ship_category_preference', {
      category: category,
      level: priority,
    });
  };

  return (
    <Section title="Ship roles" fill scrollable>
      <Box mb={2} color="label">
        Choose the departments you want to join. Higher priorities are checked
        first; if no match is available, you receive an available role.
      </Box>
      <div className="CharacterSetup__roles">
        {categories.map((category) => (
          <div key={category} className="CharacterSetup__role">
            <Box bold fontSize="1.2em" mb={2}>
              {category}
            </Box>
            <Stack>
              {priorities.map(({ name, value, color }) => (
                <Stack.Item grow key={name}>
                  <Button
                    fluid
                    textAlign="center"
                    color={
                      (categoryPreferences[category] || null) === value
                        ? color
                        : 'default'
                    }
                    icon={
                      (categoryPreferences[category] || null) === value
                        ? 'check'
                        : undefined
                    }
                    selected={(categoryPreferences[category] || null) === value}
                    onClick={() => handleSetPriority(category, value)}
                  >
                    {name}
                  </Button>
                </Stack.Item>
              ))}
            </Stack>
          </div>
        ))}
      </div>
      {categories.length === 0 && (
        <Box color="label">No ship categories available.</Box>
      )}
    </Section>
  );
}
