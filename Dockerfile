FROM php:8.5-apache-bookworm

# Copy only application source. No local records, credentials, or Git metadata.
WORKDIR /app
COPY *.html /app/
COPY assets/ /app/assets/
COPY seller-site/*.html /app/seller-site/
COPY seller-site/assets/ /app/seller-site/assets/
COPY server/src/ /app/server/src/
COPY server/public/ /app/server/public/
COPY server/router.php /app/server/router.php
COPY deploy/web/index.php /var/www/html/index.php
COPY deploy/apache.conf /etc/apache2/sites-available/000-default.conf
COPY deploy/ports.conf /etc/apache2/ports.conf
COPY deploy/php.ini /usr/local/etc/php/conf.d/store.ini

RUN a2enmod rewrite \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && mkdir -p /var/lib/lk-store \
    && chown www-data:www-data /var/lib/lk-store \
    && chmod 700 /var/lib/lk-store \
    && php -r 'foreach (["curl", "fileinfo", "mbstring", "openssl"] as $extension) { if (!extension_loaded($extension)) { fwrite(STDERR, "Missing PHP extension: ".$extension.PHP_EOL); exit(1); } }'

ENV PORT=10000 LK_STORAGE_DIR=/var/lib/lk-store LK_STORAGE_DRIVER=github
EXPOSE 10000
CMD ["apache2-foreground"]
