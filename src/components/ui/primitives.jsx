import React from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function AppShell({
  header,
  sidebar,
  footer,
  children,
  className = '',
  contentClassName = '',
  sidebarClassName = '',
  mainClassName = '',
  stickyHeader = true,
}) {
  return (
    <div className={cx('ui-app-shell', className, !sidebar && 'ui-app-shell--no-sidebar')}>
      {header ? (
        <header className={cx(stickyHeader && 'ui-app-shell__header')}>
          {header}
        </header>
      ) : null}

      <div className={cx('ui-app-shell__body', contentClassName)}>
        {sidebar ? <aside className={cx('ui-app-shell__sidebar', sidebarClassName)}>{sidebar}</aside> : null}
        <main className={cx('ui-app-shell__main', mainClassName)}>{children}</main>
      </div>

      {footer ? <footer className="ui-app-shell__footer">{footer}</footer> : null}
    </div>
  );
}

export function DashboardCard({
  as: Component = 'section',
  className = '',
  interactive = false,
  children,
  ...props
}) {
  const baseProps = {
    className: cx('ui-card ui-dashboard-card', interactive && 'ui-card--interactive', className),
    ...props,
  };
  if (Component === 'section') {
    return (
      <section
        {...baseProps}
      >
        {children}
      </section>
    );
  }
  return React.createElement(Component, baseProps, children);
}

export function ChartCard({
  title,
  description,
  actions,
  className = '',
  bodyClassName = '',
  children,
  ...props
}) {
  return (
    <section
      className={cx('ui-card ui-chart-card', className)}
      {...props}
    >
      {(title || description || actions) ? (
        <div className="ui-chart-card__header">
          <div>
            {title ? <h3 className="ui-chart-card__title">{title}</h3> : null}
            {description ? <p className="ui-chart-card__description">{description}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx('ui-chart-card__body', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PremiumTabs({
  items = [],
  value,
  onChange,
  className = '',
  buttonClassName = '',
}) {
  return (
    <div className={cx('ui-premium-tabs', className)} role="tablist" aria-orientation="horizontal">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={item.controlsId}
            id={item.id}
            disabled={Boolean(item.disabled)}
            className={cx('ui-premium-tabs__button', buttonClassName)}
            onClick={() => !item.disabled && onChange?.(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function SidebarStat({
  label,
  value,
  sub,
  className = '',
}) {
  return (
    <section className={cx('ui-card ui-sidebar-stat', className)}>
      {label ? <p className="ui-sidebar-stat__label">{label}</p> : null}
      {value !== undefined ? <p className="ui-sidebar-stat__value">{value}</p> : null}
      {sub ? <p className="ui-sidebar-stat__sub">{sub}</p> : null}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  className = '',
}) {
  return (
    <section className={cx('ui-card ui-metric-card', className)}>
      {label ? <p className="ui-metric-card__label">{label}</p> : null}
      {value !== undefined ? <p className="ui-metric-card__value">{value}</p> : null}
      {sub ? <p className="ui-metric-card__sub">{sub}</p> : null}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className = '',
}) {
  return (
    <header className={cx('ui-section-header', className)}>
      <div>
        {title ? <h2 className="ui-section-header__title">{title}</h2> : null}
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}

export function FilmPosterCard({
  title,
  poster,
  alt,
  meta,
  sub,
  onClick,
  className = '',
  imageClassName = '',
  children,
}) {
  const body = (
    <>
      <div className={cx('ui-film-poster-card__image-wrap', imageClassName)}>
        {poster ? (
          <img src={poster} alt={alt || title || 'Film poster'} className="ui-film-poster-card__image" loading="lazy" />
        ) : null}
      </div>
      {title ? <h4 className="ui-film-poster-card__title">{title}</h4> : null}
      {meta ? <p className="ui-film-poster-card__meta">{meta}</p> : null}
      {sub ? <p className="ui-film-poster-card__sub">{sub}</p> : null}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cx('ui-card ui-card--interactive ui-film-poster-card', className)} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <article className={cx('ui-card ui-film-poster-card', className)}>{body}</article>;
}
