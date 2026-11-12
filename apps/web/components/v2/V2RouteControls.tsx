'use client';

import type {ReactNode,Ref} from 'react';
import NextLink from 'next/link';
import {Button,Link as HeroLink} from '@heroui/react';

/**
 * Navigation adapter, not a custom control: HeroUI owns the appearance,
 * accessible interaction states and focus. NextLink owns client-side routing.
 */
type RouteProps={
  href:string;
  children:ReactNode;
  className?:string;
  ariaLabel?:string;
  ariaCurrent?:'page';
};

type ActionProps=RouteProps&{
  variant?:'primary'|'secondary'|'tertiary'|'outline'|'ghost';
  size?:'sm'|'md'|'lg';
};

export function V2ActionLink({href,children,className,ariaLabel,ariaCurrent,
  variant='secondary',size='md'}:ActionProps){
  return <Button
    variant={variant}
    size={size}
    className={className}
    aria-label={ariaLabel}
    aria-current={ariaCurrent}
    render={({ref,...props})=><NextLink {...props} href={href} ref={ref as Ref<HTMLAnchorElement>}/>}>
    {children}
  </Button>;
}

export function V2TextLink({href,children,className,ariaLabel,ariaCurrent}:RouteProps){
  return <HeroLink
    href={href}
    className={className}
    aria-label={ariaLabel}
    aria-current={ariaCurrent}
    render={({ref,...props})=><NextLink {...props} href={href} ref={ref as Ref<HTMLAnchorElement>}/>}>
    {children}
  </HeroLink>;
}
