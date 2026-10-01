/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cloneElement } from "react";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@makeplane/propel/components/menu";
import { PagesOutline, TemplatesOutline } from "@makeplane/propel/icons";
// plane imports
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

type TNewPageMenuTrigger = React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;

type Props = {
  projectId: string;
  // the control that creates a page; it keeps its own onClick, e.g. to stop a surrounding link
  trigger: TNewPageMenuTrigger;
  // null creates a blank page
  onSelect: (templateId: string | null) => void;
  align?: "start" | "center" | "end";
};

/**
 * Lets a "new page" control offer the project's templates. With no templates the control creates a
 * blank page directly, as before. Modelled on the page actions menu (dropdowns/actions.tsx).
 */
export const NewPageMenu = observer(function NewPageMenu(props: Props) {
  const { projectId, trigger, onSelect, align = "start" } = props;
  const { getProjectTemplatePages } = usePageStore(EPageStoreType.PROJECT);
  const templates = getProjectTemplatePages(projectId);

  if (templates.length === 0)
    return cloneElement(trigger, {
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        trigger.props.onClick?.(e);
        onSelect(null);
      },
    });

  return (
    <Menu>
      <MenuTrigger render={trigger} />
      {/* stop menu clicks from reaching a surrounding link through the portal */}
      <MenuContent side="bottom" align={align} onClick={(e) => e.stopPropagation()}>
        <MenuItem
          label="Blank page"
          icon={<Icon icon={PagesOutline} />}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(null);
          }}
        />
        <MenuSeparator />
        <MenuGroup>
          <MenuLabel>Templates</MenuLabel>
          {templates.map((template) => (
            <MenuItem
              key={template.id}
              label={getPageName(template.name)}
              icon={
                template.logo_props?.in_use ? (
                  <Logo logo={template.logo_props} size={14} type="lucide" />
                ) : (
                  <Icon icon={TemplatesOutline} />
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                if (template.id) onSelect(template.id);
              }}
            />
          ))}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
});

type TPageTemplateSelectProps = {
  projectId: string;
  value: string | null;
  onChange: (templateId: string | null) => void;
};

/**
 * Picks the template a page is created from, in the create page dialog. Renders nothing when the
 * project has no templates.
 */
export const PageTemplateSelect = observer(function PageTemplateSelect(props: TPageTemplateSelectProps) {
  const { projectId, value, onChange } = props;
  const { getProjectTemplatePages } = usePageStore(EPageStoreType.PROJECT);
  const templates = getProjectTemplatePages(projectId);
  if (templates.length === 0) return null;

  const selected = templates.find((template) => template.id === value);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            stretch="auto"
            label={selected ? `Template: ${getPageName(selected.name)}` : "Blank page"}
            icon={<Icon icon={selected ? TemplatesOutline : PagesOutline} />}
          />
        }
      />
      <MenuContent side="top" align="start">
        <MenuItem
          label="Blank page"
          icon={<Icon icon={PagesOutline} />}
          selected={!selected}
          onClick={() => onChange(null)}
        />
        <MenuSeparator />
        <MenuGroup>
          <MenuLabel>Templates</MenuLabel>
          {templates.map((template) => (
            <MenuItem
              key={template.id}
              label={getPageName(template.name)}
              icon={<Icon icon={TemplatesOutline} />}
              selected={template.id === value}
              onClick={() => template.id && onChange(template.id)}
            />
          ))}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
});
