'use client';

import type {ReactNode,Ref} from 'react';
import NextLink from 'next/link';
import {Link as HeroLink} from '@heroui/react';
import {buttonVariants} from '@heroui/styles';

/**
 * A routing adapter — never a hand-written control. HeroUI Link supplies
 * anchor semantics, accessible interaction/focus, and buttonVariants supplies
 * the exact native HeroUI button appearance for navigation CTAs.
 * NextLink retains client-side routing, modifier-click and new-tab behavior.
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
  return <HeroLink
    href={href}
    className={[buttonVariants({variant,size}),className].filter(Boolean).join(' ')}
    aria-label={ariaLabel}
    aria-current={ariaCurrent}
    render={({ref,...props})=><NextLink {...props} href={href} ref={ref as Ref<HTMLAnchorElement>}/>}>
    {children}
  </HeroLink>;
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
