import { type SetStateAction, useState } from 'react';
import { HIDE_NATIVE_PREVIEWS } from 'solarium_tgui/components/WindowGeometry';
import { useBackend } from 'tgui/backend';
import { Box, Button, Stack } from 'tgui-core/components';
import { exhaustiveCheck } from 'tgui-core/exhaustive';

import { PageButton } from '../components/PageButton';
import type { PreferencesMenuData } from '../types';
import { LoadoutPage } from './loadout';
import { MainPage } from './MainPage';
import { QuirksPage } from './QuirksPage';
import { ShipCategoriesPage } from './ShipCategoriesPage';
import { SpeciesPage } from './SpeciesPage';

enum Page {
  Main,
  ShipCategories,
  Species,
  Quirks,
  Loadout,
}

type ProfileProps = {
  activeSlot: number;
  onClick: (index: number) => void;
  profiles: (string | null)[];
};

function CharacterProfiles(props: ProfileProps) {
  const { activeSlot, onClick, profiles } = props;

  return (
    <Stack wrap>
      {profiles.map((profile, slot) => (
        <Stack.Item key={slot}>
          <Button
            selected={slot === activeSlot}
            onClick={() => {
              onClick(slot);
            }}
            icon={profile ? 'user' : 'plus'}
            fluid
          >
            {profile ?? 'New Character'}
          </Button>
        </Stack.Item>
      ))}
    </Stack>
  );
}

export function CharacterPreferenceWindow(props) {
  const { act, data } = useBackend<PreferencesMenuData>();

  const [currentPage, setCurrentPage] = useState(Page.Main);

  const changePage = (next: SetStateAction<Page>) => {
    const page = typeof next === 'function' ? next(currentPage) : next;
    if (page === currentPage) return;
    window.dispatchEvent(new Event(HIDE_NATIVE_PREVIEWS));
    Byond.winset(data.character_preview_view, { 'is-visible': false });
    setCurrentPage(page);
  };

  let pageContents;

  switch (currentPage) {
    case Page.ShipCategories:
      pageContents = <ShipCategoriesPage />;
      break;
    case Page.Main:
      pageContents = <MainPage openSpecies={() => changePage(Page.Species)} />;

      break;
    case Page.Species:
      pageContents = <SpeciesPage closeSpecies={() => changePage(Page.Main)} />;

      break;
    case Page.Quirks:
      pageContents = <QuirksPage />;
      break;

    case Page.Loadout:
      pageContents = <LoadoutPage />;
      break;

    default:
      exhaustiveCheck(currentPage);
  }

  return (
    <Stack vertical fill className="CharacterSetup">
      <Stack.Item className="CharacterSetup__profiles">
        <Box className="CharacterSetup__eyebrow">CHARACTER PROFILES</Box>
        <CharacterProfiles
          activeSlot={data.active_slot - 1}
          onClick={(slot) => {
            act('change_slot', {
              slot: slot + 1,
            });
          }}
          profiles={data.character_profiles}
        />
      </Stack.Item>
      {!data.content_unlocked && (
        <Stack.Item className="CharacterSetup__hint">
          BYOND membership unlocks additional character slots.
        </Stack.Item>
      )}
      <Stack.Divider />
      <Stack.Item>
        <Stack fill className="CharacterSetup__tabs">
          <Stack.Item grow>
            <PageButton
              currentPage={currentPage}
              page={Page.Main}
              setPage={changePage}
              otherActivePages={[Page.Species]}
            >
              Character
            </PageButton>
          </Stack.Item>

          <Stack.Item grow>
            <PageButton
              currentPage={currentPage}
              page={Page.Loadout}
              setPage={changePage}
            >
              Loadout
            </PageButton>
          </Stack.Item>

          <Stack.Item grow>
            <PageButton
              currentPage={currentPage}
              page={Page.ShipCategories}
              setPage={changePage}
            >
              Ship Roles
            </PageButton>
          </Stack.Item>

          <Stack.Item grow>
            <PageButton
              currentPage={currentPage}
              page={Page.Quirks}
              setPage={changePage}
            >
              Quirks
            </PageButton>
          </Stack.Item>
        </Stack>
      </Stack.Item>
      <Stack.Divider />
      <Stack.Item
        grow
        basis={0}
        className="CharacterSetup__page"
        position="relative"
      >
        {pageContents}
      </Stack.Item>
    </Stack>
  );
}
